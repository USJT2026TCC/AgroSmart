"""Entradas sintéticas para testar erros; não representam medições reais."""
import io
import zipfile

import pytest

from etl.inmet import baixar_ano, ler_csv

CSV = (
    "REGIAO:;SE\nUF:;SP\nESTACAO:;ESTACAO DE TESTE\nCODIGO (WMO):;A770\n"
    "LATITUDE:;-21,46\nLONGITUDE:;-47,57\nALTITUDE:;600\nDATA DE FUNDACAO:;2020\n"
    "Data;Hora UTC;PRECIPITAÇÃO TOTAL, HORÁRIO (mm)\n2024/01/01;0000 UTC;1,0\n"
)


def test_colunas_obrigatorias_nao_podem_ser_substituidas_por_ausencia_de_chuva():
    for coluna in ["Data;", "Hora UTC;", "PRECIPITAÇÃO TOTAL, HORÁRIO (mm)"]:
        with pytest.raises(ValueError, match="Colunas obrigatórias"):
            ler_csv(CSV.replace(coluna, "outra;").encode("latin-1"))


def test_metadados_ausentes_nao_viram_coordenadas_zero():
    for campo in ["LATITUDE:;-21,46", "LONGITUDE:;-47,57", "ESTACAO:;ESTACAO DE TESTE"]:
        with pytest.raises(ValueError, match="Metadados obrigatórios"):
            ler_csv(CSV.replace(campo, "VAZIO:;").encode("latin-1"))


@pytest.mark.parametrize("horario", ["0030 UTC", "2400 UTC", "00XX UTC"])
def test_horarios_invalidos_nao_sao_arredondados_para_uma_hora(horario):
    with pytest.raises(ValueError):
        ler_csv(CSV.replace("0000 UTC", horario).encode("latin-1"))


@pytest.mark.parametrize("latitude", ["nan", "91", "-91"])
def test_coordenadas_invalidas_sao_recusadas(latitude):
    with pytest.raises(ValueError, match="Latitude"):
        ler_csv(CSV.replace("LATITUDE:;-21,46", f"LATITUDE:;{latitude}").encode("latin-1"))


def test_cache_corrompido_e_substituido_apenas_apos_download_valido(tmp_path, monkeypatch):
    destino = tmp_path / "2024.zip"
    destino.write_bytes(b"nao e zip")
    dados = io.BytesIO()
    with zipfile.ZipFile(dados, "w") as z:
        z.writestr("fixture.txt", "arquivo sintético")

    class Resposta:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield dados.getvalue()

    chamadas = []
    monkeypatch.setattr("etl.inmet.requests.get", lambda *a, **k: chamadas.append(a[0]) or Resposta())
    assert baixar_ano(2024, destino) == destino
    assert zipfile.is_zipfile(destino)
    assert len(chamadas) == 1
    baixar_ano(2024, destino)
    assert len(chamadas) == 1
