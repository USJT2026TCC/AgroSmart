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
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests

URL_DO_ANO = "https://portal.inmet.gov.br/uploads/dadoshistoricos/{ano}.zip"

# O portal do INMET fecha a conexao quando o cabecalho de agente nao parece o de
# um navegador. Nao e autenticacao nem contorno de protecao: o arquivo e publico
# e o mesmo que o navegador baixa.
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
    """Metadados do cabecalho do CSV."""

    codigo: str
    nome: str
    uf: str
    regiao: str
    latitude: float
    longitude: float
    altitude: float | None


@dataclass(frozen=True)
class Leitura:
    """Uma hora medida. Campo ausente e `None`, nunca zero."""

    instante: datetime
    chuva_mm: float | None


def baixar_ano(ano: int, destino: Path) -> Path:
    """Baixa o ZIP anual do INMET, se ainda nao estiver em disco."""
    destino.parent.mkdir(parents=True, exist_ok=True)

    if destino.exists() and destino.stat().st_size > 0:
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
    with zipfile.ZipFile(temporario) as arquivo:
        if not arquivo.namelist():
            raise ValueError("ZIP anual vazio.")
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

    # Sentinelas negativos de precipitacao sao descartados pelo leitor.
    return valor


def _instante(data: str, hora: str) -> datetime:
    """'2024/07/02' + '0300 UTC' (ou '2018-07-02' + '03:00') -> datetime com fuso UTC."""
    data = data.replace("-", "/").strip()
    hora_limpa = hora.strip().replace("UTC", "").strip()
    horas = int(hora_limpa[:2])

    ano, mes, dia = (int(parte) for parte in data.split("/"))

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

    estacao = Estacao(
        codigo=cabecalho.get("CODIGO (WMO)", "?"),
        nome=cabecalho.get("ESTACAO", "?"),
        uf=cabecalho.get("UF", "?"),
        regiao=cabecalho.get("REGIAO", "?"),
        latitude=float(cabecalho.get("LATITUDE", "0").replace(",", ".")),
        longitude=float(cabecalho.get("LONGITUDE", "0").replace(",", ".")),
        altitude=_numero(cabecalho.get("ALTITUDE", "")),
    )

    leitor = csv.DictReader(io.StringIO("\n".join(linhas[8:])), delimiter=";")
    leituras: list[Leitura] = []

    for registro in leitor:
        # Ate 2018 o INMET nomeava as colunas "DATA (YYYY-MM-DD)" e "HORA (UTC)",
        # com a hora em "00:00"; de 2019 em diante, "Data" e "Hora UTC", com
        # "0000 UTC". Sem aceitar os dois, os anos antigos voltavam vazios.
        data = (registro.get("Data") or registro.get("DATA (YYYY-MM-DD)") or "").strip()
        hora = (registro.get("Hora UTC") or registro.get("HORA (UTC)") or "").strip()

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
