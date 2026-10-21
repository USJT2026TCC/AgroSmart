"""Prepara os dados historicos do INMET. Nao simula sensores nem muda datas."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from .limites import ESTACAO, FIM, INICIO
from .preparacao import preparar

DIR_DADOS = Path(__file__).resolve().parents[2] / "dados"


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="etl", description="ETL historico do INMET para o AgroSmart"
    )
    sub = parser.add_subparsers(dest="comando", required=True)
    comando = sub.add_parser("preparar", help="extrai, valida e consolida sem alterar datas")
    comando.add_argument("--estacao", default=ESTACAO)
    comando.add_argument("--de", default=INICIO.isoformat())
    comando.add_argument("--ate", default=FIM.isoformat())
    return parser


def main(argumentos: list[str] | None = None) -> int:
    opcoes = construir_parser().parse_args(argumentos)
    try:
        manifesto = preparar(
            DIR_DADOS, date.fromisoformat(opcoes.de), date.fromisoformat(opcoes.ate), opcoes.estacao
        )
        print(f"Manifesto: {DIR_DADOS / 'preparado' / opcoes.estacao.upper() / 'manifesto.json'}")
        if any(a["status"] != "preparado" for a in manifesto["anos"].values()):
            print("Preparacao incompleta: consulte o manifesto antes de importar.", file=sys.stderr)
            return 1
    except (ValueError, OSError) as erro:
        print(f"Falha na preparacao: {erro}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Preparacao interrompida; o cache valido sera reutilizado.", file=sys.stderr)
        return 130
    return 0
