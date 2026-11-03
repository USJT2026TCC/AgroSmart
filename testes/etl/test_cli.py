"""Comando unico de preparo; sem rede ou transacoes nos testes."""

import pytest

from etl import cli


def test_preparo_padrao_preserva_estacao_e_datas(monkeypatch, tmp_path):
    chamadas = []
    monkeypatch.setattr(cli, "DIR_DADOS", tmp_path)
    monkeypatch.setattr(
        cli,
        "preparar",
        lambda *args: (
            chamadas.append(args) or {"anos": {"2020": {"status": "preparado"}}}
        ),
    )
    assert cli.main(["preparar"]) == 0
    assert chamadas == [(tmp_path,)]


def test_preparo_parcial_impede_sucesso(monkeypatch):
    monkeypatch.setattr(
        cli, "preparar", lambda *_: {"anos": {"2020": {"status": "falha"}}}
    )
    assert cli.main(["preparar"]) == 1


def test_envio_simulado_e_deslocamento_nao_sao_comandos():
    with pytest.raises(SystemExit):
        cli.construir_parser().parse_args(["enviar", "--ate-hoje"])


def test_preparar_nao_aceita_outro_recorte():
    with pytest.raises(SystemExit):
        cli.construir_parser().parse_args(["preparar", "--de", "2024-01-01"])
