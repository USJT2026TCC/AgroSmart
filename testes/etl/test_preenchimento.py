import csv
import io
from datetime import date

import pytest
from etl.inmet import ler_csv
from etl.preparacao import dias_normalizados, preencher_horario


def fonte(dias):
    cab = (
        "REGIAO:;SE\nUF:;SP\nESTACAO:;SAO SIMAO\nCODIGO (WMO):;A770\n"
        "LATITUDE:;-21,46\nLONGITUDE:;-47,57\nALTITUDE:;600\nDATA DE FUNDACAO:;2019\n"
        "Data;Hora UTC;PRECIPITAÇÃO TOTAL, HORÁRIO (mm);TEMPERATURA\n"
    )
    return (
        cab
        + "".join(
            f"{dia.replace('-', '/')};{h:02d}00 UTC;{v if v is not None else ''};{temp}\n"
            for dia, vs, temp in dias
            for h, v in enumerate(vs)
        )
    ).encode("latin-1")


def test_copia_horas_preserva_outras_colunas_e_documenta_original():
    bruto = fonte([("2024-01-01", [1] * 24, 20), ("2024-01-02", [None] * 24, 35)])
    tratado, auditoria, anterior = preencher_horario(
        bruto, date(2024, 1, 1), date(2024, 1, 2)
    )
    _, leituras = ler_csv(tratado)
    dias = list(dias_normalizados(leituras, date(2024, 1, 1), date(2024, 1, 2)))
    assert dias[1]["chuva_mm"] == 24
    assert dias[1]["horas_validas"] == 24
    assert auditoria[0]["origem"] == "2024-01-01"
    assert auditoria[0]["registroDiarioAnterior"]["chuva_mm"] is None
    assert len(auditoria[0]["horasCopiadas"]) == 24
    rows = list(
        csv.DictReader(
            io.StringIO("\n".join(tratado.decode("latin-1").splitlines()[8:])),
            delimiter=";",
        )
    )
    assert all(r["TEMPERATURA"] == "35" for r in rows if r["Data"] == "2024/01/02")
    assert anterior["data"] == "2024-01-01"


def test_consecutivos_e_virada_do_ano_usam_mesma_origem_observada():
    _, _, anterior = preencher_horario(
        fonte([("2020-12-31", [2] * 24, 20)]), date(2020, 12, 31), date(2020, 12, 31)
    )
    _, ajustes, _ = preencher_horario(
        fonte([("2021-01-01", [None] * 24, 20), ("2021-01-02", [None] * 24, 20)]),
        date(2021, 1, 1),
        date(2021, 1, 2),
        anterior,
    )
    assert [a["origem"] for a in ajustes] == ["2020-12-31"] * 2
    assert all(a["registroDiarioTratado"]["chuva_mm"] == 48 for a in ajustes)


def test_sem_anterior_nao_usa_futuro():
    with pytest.raises(ValueError, match="Sem dia observado válido anterior"):
        preencher_horario(
            fonte([("2024-01-01", [None] * 24, 20), ("2024-01-02", [1] * 24, 20)]),
            date(2024, 1, 1),
            date(2024, 1, 2),
        )


def test_dia_com_20_horas_permanece_byte_a_byte():
    bruto = fonte([("2024-01-01", [1] * 20 + [None] * 4, 20)])
    tratado, ajustes, _ = preencher_horario(bruto, date(2024, 1, 1), date(2024, 1, 1))
    assert tratado == bruto
    assert ajustes == []
