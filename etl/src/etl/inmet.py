"""
Leitura dos dados historicos das estacoes automaticas do INMET.

FONTE DOS DADOS

    Instituto Nacional de Meteorologia (INMET) — Dados Historicos
    https://portal.inmet.gov.br/dadoshistoricos
    Um arquivo ZIP por ano, com um CSV por estacao automatica.

Dados publicos, distribuidos gratuitamente pelo INMET, orgao do Ministerio da
Agricultura e Pecuaria. O TCC cita a fonte em toda apresentacao de numero que
venha daqui.

FORMATO DO CSV (que nao e o formato padrao de CSV)

    codificacao : latin-1
    separador   : ponto e virgula
    decimal     : virgula
    cabecalho   : 8 linhas de metadados, depois a linha de colunas
    ausente     : campo vazio ou valor negativo sentinela (-9999)
    horario     : UTC, na coluna "Hora UTC", no formato "0300 UTC"

Valores ausentes ou sentinelas nao viram zero: presumir ausencia de chuva
poderia criar uma falsa indicacao de estiagem. O preparo diario preserva a
contagem de horas ausentes e invalidas para a avaliacao da qualidade.
"""

from __future__ import annotations

import csv
import io
import math
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests

URL_DO_ANO = "https://portal.inmet.gov.br/uploads/dadoshistoricos/{ano}.zip"

# Cabeçalhos usados no download dos arquivos públicos anuais.
CABECALHOS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"
    ),
    "Accept": "*/*",
}

# Colunas do CSV que interessam ao seguro indexado, pelo nome que o INMET usa.
COLUNA_CHUVA = "PRECIPITAÇÃO TOTAL, HORÁRIO (mm)"


@dataclass(frozen=True)
class Estacao:
    """Metadados do cabecalho do CSV que vao para o manifesto."""

    codigo: str
    nome: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class Leitura:
    """Uma hora medida. Campo ausente e `None`, nunca zero."""

    instante: datetime
    chuva_mm: float | None


def _zip_valido(caminho: Path) -> bool:
    """Confere a estrutura do ZIP e a existência de entradas antes de reutilizá-lo."""
    try:
        with zipfile.ZipFile(caminho) as arquivo:
            return bool(arquivo.namelist())
    except (OSError, zipfile.BadZipFile):
        return False


def baixar_ano(ano: int, destino: Path) -> Path:
    """Reutiliza um ZIP válido ou baixa o arquivo anual para um temporário."""
    destino.parent.mkdir(parents=True, exist_ok=True)

    if _zip_valido(destino):
        return destino

    # Grava em arquivo temporario: interrupcao nunca deixa um ZIP parcial como cache.
    temporario = destino.with_suffix(".zip.part")
    with requests.get(
        URL_DO_ANO.format(ano=ano), headers=CABECALHOS, timeout=(30, 120), stream=True
    ) as resposta:
        resposta.raise_for_status()
        with temporario.open("wb") as arquivo:
            for bloco in resposta.iter_content(chunk_size=1024 * 1024):
                arquivo.write(bloco)
    if not _zip_valido(temporario):
        raise ValueError("ZIP anual inválido ou vazio.")
    temporario.replace(destino)

    return destino


def _numero(texto: str) -> float | None:
    """Converte decimal com virgula; vazio ou texto invalido vira None."""
    texto = (texto or "").strip()

    if not texto:
        return None

    try:
        valor = float(texto.replace(",", "."))
    except ValueError:
        return None

    # Valores não finitos e fora do limite são invalidados na consolidação diária.
    return valor


def _instante(data: str, hora: str) -> datetime:
    """'2024/07/02' + '0300 UTC' -> datetime com fuso UTC."""
    horario = re.fullmatch(r"(\d{2})00(?: UTC)?", hora.strip())
    if not horario:
        raise ValueError("Hora INMET inválida: use uma hora inteira em UTC.")
    horas = int(horario.group(1))
    ano, mes, dia = (int(parte) for parte in data.strip().split("/"))

    return datetime(ano, mes, dia, horas, tzinfo=timezone.utc)


def ler_csv(conteudo: bytes) -> tuple[Estacao, list[Leitura]]:
    """Interpreta o CSV de uma estacao, devolvendo metadados e leituras horarias."""
    texto = conteudo.decode("latin-1")
    linhas = texto.splitlines()

    cabecalho: dict[str, str] = {}
    for linha in linhas[:8]:
        if ";" not in linha:
            continue
        chave, valor = linha.split(";", 1)
        cabecalho[chave.strip().rstrip(":").upper()] = valor.strip().rstrip(";")

    obrigatorios = ("CODIGO (WMO)", "ESTACAO", "LATITUDE", "LONGITUDE")
    if any(not cabecalho.get(campo) for campo in obrigatorios):
        raise ValueError("Metadados obrigatórios da estação ausentes.")
    latitude = float(cabecalho["LATITUDE"].replace(",", "."))
    longitude = float(cabecalho["LONGITUDE"].replace(",", "."))
    if not math.isfinite(latitude) or not -90 <= latitude <= 90:
        raise ValueError("Latitude da estação inválida.")
    if not math.isfinite(longitude) or not -180 <= longitude <= 180:
        raise ValueError("Longitude da estação inválida.")
    estacao = Estacao(
        codigo=cabecalho["CODIGO (WMO)"],
        nome=cabecalho["ESTACAO"],
        latitude=latitude,
        longitude=longitude,
    )

    leitor = csv.DictReader(io.StringIO("\n".join(linhas[8:])), delimiter=";")
    if not {"Data", "Hora UTC", COLUNA_CHUVA}.issubset(leitor.fieldnames or []):
        raise ValueError("Colunas obrigatórias do CSV INMET ausentes.")
    leituras: list[Leitura] = []

    for registro in leitor:
        data = (registro.get("Data") or "").strip()
        hora = (registro.get("Hora UTC") or "").strip()

        if not data or not hora:
            continue

        chuva = _numero(registro.get(COLUNA_CHUVA, ""))

        leituras.append(
            Leitura(
                instante=_instante(data, hora),
                chuva_mm=chuva if chuva is not None and chuva >= 0 else None,
            )
        )

    return estacao, leituras
