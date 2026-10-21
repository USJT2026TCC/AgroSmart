"""Comando unico de preparo; sem rede ou transacoes nos testes."""

from datetime import date

import pytest

from etl import cli


def test_preparo_padrao_preserva_estacao_e_datas(monkeypatch, tmp_path):
    chamadas = []
    monkeypatch.setattr(cli, "DIR_DADOS", tmp_path)
    monkeypatch.setattr(
        cli,
        "preparar",
        lambda *args: chamadas.append(args) or {"anos": {"2020": {"status": "preparado"}}},
    )
    assert cli.main(["preparar"]) == 0
    assert chamadas == [(tmp_path, date(2020, 1, 1), date(2026, 9, 30), "A770")]


def test_preparo_parcial_impede_sucesso(monkeypatch):
    monkeypatch.setattr(cli, "preparar", lambda *_: {"anos": {"2020": {"status": "falha"}}})
    assert cli.main(["preparar"]) == 1


def test_intervalo_invalido_nao_prepara(monkeypatch):
    def nao_chamar(*_):
        pytest.fail("Nao deve preparar com data invalida")

    monkeypatch.setattr(cli, "preparar", nao_chamar)
    assert cli.main(["preparar", "--de", "invalida"]) == 1


def test_envio_simulado_e_deslocamento_nao_sao_comandos():
    with pytest.raises(SystemExit):
        cli.construir_parser().parse_args(["enviar", "--ate-hoje"])
