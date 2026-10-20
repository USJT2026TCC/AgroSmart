"""Prepara uma unica estacao do INMET, mantendo datas e lacunas originais.

Os ZIPs sao cache de download; os CSVs extraidos e seus SHA-256 permitem
reconstituir a origem. Reexecucoes conferem os arquivos preparados antes de pular.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
import zipfile
from datetime import date, timedelta
from pathlib import Path

from .inmet import URL_DO_ANO, baixar_ano, ler_csv

COLUNAS = ("data", "chuva_mm", "horas_validas", "horas_ausentes", "horas_invalidas")


def sha256(caminho: Path) -> str:
    resumo = hashlib.sha256()
    with caminho.open("rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(1024 * 1024), b""):
            resumo.update(bloco)
    return resumo.hexdigest()


def dias_normalizados(leituras, inicio: date, fim: date):
    """Duplicatas conflitantes invalidam a hora. Nenhuma lacuna vira zero."""
    horas = {}
    for leitura in leituras:
        if not inicio <= leitura.instante.date() <= fim:
            continue
        instante = leitura.instante
        valor = leitura.chuva_mm
        if valor is None or not math.isfinite(valor) or not 0 <= valor <= 500:
            valor = None
        if instante in horas and horas[instante] != valor:
            horas[instante] = None
        else:
            horas.setdefault(instante, valor)
    por_dia = {}
    for instante, valor in horas.items():
        por_dia.setdefault(instante.date(), []).append(valor)
    dia = inicio
    while dia <= fim:
        registros = por_dia.get(dia, [])
        validos = [v for v in registros if v is not None]
        yield {
            "data": dia.isoformat(),
            "chuva_mm": round(sum(validos), 1) if validos else None,
            "horas_validas": len(validos),
            "horas_ausentes": 24 - len(registros),
            "horas_invalidas": len(registros) - len(validos),
        }
        dia += timedelta(days=1)


def preparar(raiz: Path, inicio: date, fim: date, estacao="A770", aviso=print):
    if inicio > fim or fim > date.today():
        raise ValueError("Intervalo invertido ou futuro.")
    estacao = estacao.upper()
    if not estacao.isalnum():
        raise ValueError("Codigo de estacao invalido.")
    saida = raiz / "preparado" / estacao
    saida.mkdir(parents=True, exist_ok=True)
    manifesto_path = saida / "manifesto.json"
    manifesto = (
        json.loads(manifesto_path.read_text(encoding="utf-8"))
        if manifesto_path.exists()
        else {"versao": 1, "estacao": estacao, "anos": {}}
    )
    # Mantem apenas o recorte solicitado no manifesto operacional, sem apagar os originais.
    manifesto["anos"] = {
        ano: meta for ano, meta in manifesto["anos"].items() if inicio.year <= int(ano) <= fim.year
    }
    manifesto.update(
        inicio=inicio.isoformat(),
        fim=fim.isoformat(),
        fonte="INMET",
        regra="dia valido: >=20 horas validas; seco: <1 mm; lacuna interrompe sequencia",
    )
    for ano in range(inicio.year, fim.year + 1):
        de = max(inicio, date(ano, 1, 1))
        ate = min(fim, date(ano, 12, 31))
        anterior = manifesto["anos"].get(str(ano), {})
        bruto = saida / f"{ano}-original.csv"
        diario = saida / f"{ano}-diario.csv"
        if (
            anterior.get("inicio") == de.isoformat()
            and anterior.get("fim") == ate.isoformat()
            and anterior.get("status") == "preparado"
            and anterior.get("versaoPreparo") == 2
            and bruto.exists()
            and diario.exists()
            and sha256(bruto) == anterior.get("sha256Original")
            and sha256(diario) == anterior.get("sha256Diario")
        ):
            aviso(f"{ano}: preparado anteriormente; reutilizado")
            continue
        registro = {
            "inicio": de.isoformat(),
            "fim": ate.isoformat(),
            "url": URL_DO_ANO.format(ano=ano),
        }
        try:
            aviso(f"{ano}: verificando arquivo anual INMET...")
            caminho = baixar_ano(ano, raiz / f"{ano}.zip")
            with zipfile.ZipFile(caminho) as z:
                nomes = [
                    n
                    for n in z.namelist()
                    if n.upper().endswith(".CSV") and f"_{estacao}_" in n.upper()
                ]
                # O ZIP de 2026 contem snapshots de agosto e setembro da mesma
                # estacao. Seleciona a maior data final declarada no nome,
                # sem concatenar snapshots e duplicar precipitacao.
                if len(nomes) > 1:

                    def fim_do_snapshot(nome):
                        partes = re.search(r"_(\d{2})-(\d{2})-(\d{4})\.CSV$", nome.upper())
                        if not partes:
                            return date.min
                        dia, mes, ano_snapshot = map(int, partes.groups())
                        return date(ano_snapshot, mes, dia)

                    maior_fim = max(map(fim_do_snapshot, nomes))
                    registro["snapshotsEncontrados"] = sorted(nomes)
                    nomes = [nome for nome in nomes if fim_do_snapshot(nome) == maior_fim]
                if len(nomes) != 1:
                    registro.update(status="estacao_ausente" if not nomes else "estacao_ambigua")
                else:
                    conteudo = z.read(nomes[0])
                    meta, leituras = ler_csv(conteudo)
                    if meta.codigo.upper() != estacao:
                        raise ValueError("Codigo no cabecalho difere do arquivo.")
                    bruto.write_bytes(conteudo)
                    linhas = list(dias_normalizados(leituras, de, ate))
                    temporario = diario.with_suffix(".tmp")
                    with temporario.open("w", encoding="utf-8", newline="") as f:
                        w = csv.DictWriter(f, fieldnames=COLUNAS)
                        w.writeheader()
                        w.writerows(linhas)
                    temporario.replace(diario)
                    registro.update(
                        status="preparado",
                        versaoPreparo=2,
                        arquivoNoZip=nomes[0],
                        sha256Original=sha256(bruto),
                        sha256Diario=sha256(diario),
                        dias=len(linhas),
                        diasValidos=sum(linha["horas_validas"] >= 20 for linha in linhas),
                        primeiroRegistro=min(leitura.instante for leitura in leituras).isoformat(),
                        ultimoRegistro=max(leitura.instante for leitura in leituras).isoformat(),
                        nome=meta.nome,
                        latitude=meta.latitude,
                        longitude=meta.longitude,
                    )
        except Exception as erro:
            registro.update(status="falha", motivo=str(erro))
        manifesto["anos"][str(ano)] = registro
        temporario = manifesto_path.with_suffix(".tmp")
        temporario.write_text(
            json.dumps(manifesto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        temporario.replace(manifesto_path)
        aviso(f"{ano}: {registro['status']} — {registro.get('diasValidos', 0)} dias validos")
    return manifesto
