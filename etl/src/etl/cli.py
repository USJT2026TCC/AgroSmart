"""Comando de preparação dos dados históricos oficiais do INMET."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .limites import ESTACAO
from .preparacao import preparar

DIR_DADOS = Path(__file__).resolve().parents[2] / "dados"


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="etl", description="ETL historico do INMET para o AgroSmart"
    )
    sub = parser.add_subparsers(dest="comando", required=True)
    sub.add_parser("preparar", help="extrai, valida e consolida a estacao A770 de 2020 a 2026")
    return parser


def main(argumentos: list[str] | None = None) -> int:
    construir_parser().parse_args(argumentos)
    try:
        manifesto = preparar(DIR_DADOS)
        print(f"Manifesto: {DIR_DADOS / 'preparado' / ESTACAO / 'manifesto.json'}")
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
