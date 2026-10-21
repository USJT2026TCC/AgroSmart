from datetime import date, datetime, timezone

from etl.inmet import Leitura
from etl.preparacao import dias_normalizados


def leitura(dia, hora, chuva):
    return Leitura(datetime(2024, 1, dia, hora, tzinfo=timezone.utc), chuva)


def test_ausencia_nao_vira_zero_e_dia_sem_registros_aparece():
    dias = list(dias_normalizados([leitura(1, 0, None)], date(2024, 1, 1), date(2024, 1, 2)))
    assert dias[0]["chuva_mm"] is None
    assert dias[0]["horas_invalidas"] == 1
    assert dias[1]["chuva_mm"] is None
    assert dias[1]["horas_ausentes"] == 24


def test_duplicata_nao_inflaciona_soma_e_conflito_invalida_hora():
    linhas = [
        leitura(1, 0, 5),
        leitura(1, 0, 5),
        leitura(1, 1, 0),
        leitura(1, 1, 3),
        leitura(1, 2, float("nan")),
    ]
    dia = list(dias_normalizados(linhas, date(2024, 1, 1), date(2024, 1, 1)))[0]
    assert dia["chuva_mm"] == 5
    assert dia["horas_validas"] == 1
    assert dia["horas_invalidas"] == 2
    assert dia["horas_ausentes"] == 21


def test_preparo_escolhe_snapshot_recente_e_reutiliza_arquivo_validado(tmp_path, monkeypatch):
    import csv
    import zipfile

    from etl.preparacao import preparar

    cabecalho = (
        "REGIAO:;SE\nUF:;SP\nESTACAO:;SAO SIMAO\nCODIGO (WMO):;A770\n"
        "LATITUDE:;-21,46\nLONGITUDE:;-47,57\nALTITUDE:;600\nDATA DE FUNDACAO:;2019\n"
        "Data;Hora UTC;PRECIPITAÇÃO TOTAL, HORÁRIO (mm)\n"
    )
    arquivo = tmp_path / "2026.zip"
    with zipfile.ZipFile(arquivo, "w") as z:
        z.writestr(
            "INMET_SE_SP_A770_SAO SIMAO_01-01-2026_A_31-08-2026.CSV",
            (cabecalho + "2026/08/31;0000 UTC;9,0\n").encode("latin-1"),
        )
        z.writestr(
            "INMET_SE_SP_A770_SAO SIMAO_01-01-2026_A_30-09-2026.CSV",
            (cabecalho + "2026/09/30;0000 UTC;2,0\n").encode("latin-1"),
        )
    chamadas = []
    monkeypatch.setattr(
        "etl.preparacao.baixar_ano",
        lambda ano, destino: chamadas.append(ano) or arquivo,
    )
    m = preparar(tmp_path, date(2026, 1, 1), date(2026, 9, 30), aviso=lambda *_: None)
    assert m["anos"]["2026"]["status"] == "preparado"
    assert m["anos"]["2026"]["arquivoNoZip"].endswith("30-09-2026.CSV")
    diario = tmp_path / "preparado/A770/2026-diario.csv"
    with diario.open(encoding="utf-8") as f:
        dias = list(csv.DictReader(f))
    assert dias[-1]["chuva_mm"] == "2.0"
    assert dias[0]["chuva_mm"] == ""
    preparar(tmp_path, date(2026, 1, 1), date(2026, 9, 30), aviso=lambda *_: None)
    assert chamadas == [2026]
    diario.write_text("alterado", encoding="utf-8")
    preparar(tmp_path, date(2026, 1, 1), date(2026, 9, 30), aviso=lambda *_: None)
    assert chamadas == [2026, 2026]


def test_download_interrompido_nao_vira_cache_valido(tmp_path, monkeypatch):
    import pytest

    from etl.inmet import baixar_ano

    class Resposta:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"download parcial"
            raise ConnectionError("interrompido")

    monkeypatch.setattr("etl.inmet.requests.get", lambda *_, **__: Resposta())
    destino = tmp_path / "2024.zip"
    with pytest.raises(ConnectionError):
        baixar_ano(2024, destino)
    assert not destino.exists()
    assert destino.with_suffix(".zip.part").exists()


def test_preparo_recusa_fora_do_recorte_sem_baixar(tmp_path):
    import pytest

    from etl.preparacao import preparar

    for inicio, fim, estacao in [
        (date(2019, 12, 31), date(2020, 1, 1), "A770"),
        (date(2026, 9, 30), date(2026, 10, 1), "A770"),
        (date(2024, 1, 1), date(2024, 1, 2), "A747"),
    ]:
        with pytest.raises(ValueError):
            preparar(tmp_path, inicio, fim, estacao)
    assert not (tmp_path / "preparado").exists()
