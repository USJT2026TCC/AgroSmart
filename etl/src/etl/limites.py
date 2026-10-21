"""Recorte historico compartilhado com API, oraculo e interface."""

import json
from datetime import date
from pathlib import Path

CONFIG = json.loads(
    (Path(__file__).resolve().parents[3] / "configuracao" / "historico.json").read_text(
        encoding="utf-8"
    )
)
INICIO = date.fromisoformat(CONFIG["inicio"])
FIM = date.fromisoformat(CONFIG["fim"])
ESTACAO = CONFIG["estacao"]
