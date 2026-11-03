"""Prepara uma unica estacao do INMET, preservando a fonte e auditando o preenchimento experimental.

Os ZIPs sao cache de download; os CSVs extraidos e seus SHA-256 permitem
reconstituir a origem. Reexecucoes conferem os arquivos preparados antes de pular.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import zipfile
from datetime import date, timedelta
from pathlib import Path

from .inmet import COLUNA_CHUVA, URL_DO_ANO, baixar_ano, ler_csv
from .limites import CHUVA_DIA_SECO_MM, ESTACAO, FIM, HORAS_MINIMAS, INICIO

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


def preencher_horario(conteudo, inicio, fim, anterior=None):
    """Copia somente a precipitação horária; outras variáveis não são inventadas.

    A fonte intacta fica em outro arquivo. Uma sequência incompleta usa sempre
    o último dia observado válido, inclusive na mudança de ano. Nunca usa futuro.
    """
    meta, leituras = ler_csv(conteudo)
    texto = conteudo.decode("latin-1").splitlines()
    cabecalho = next(csv.reader([texto[8]], delimiter=";"))
    coluna = cabecalho.index(COLUNA_CHUVA)
    registros = list(csv.reader(texto[9:], delimiter=";"))
    por_dia = {}
    for registro in registros:
        if len(registro) > coluna and registro[0].strip() and registro[1].strip():
            dia = date.fromisoformat(registro[0].strip().replace("/", "-"))
            por_dia.setdefault(dia.isoformat(), []).append(registro)
    # Mesma resolução de duplicatas e valores inválidos da consolidação diária.
    horas = {}
    for leitura in leituras:
        valor = leitura.chuva_mm
        if valor is None or not math.isfinite(valor) or not 0 <= valor <= 500:
            valor = None
        if leitura.instante in horas and horas[leitura.instante] != valor:
            horas[leitura.instante] = None
        else:
            horas.setdefault(leitura.instante, valor)
    preenchimentos = []
    for dia in dias_normalizados(leituras, inicio, fim):
        iso = dia["data"]
        if dia["horas_validas"] >= HORAS_MINIMAS:
            valores = {
                instante.hour: valor
                for instante, valor in horas.items()
                if instante.date().isoformat() == iso
            }
            anterior = {"data": iso, "horas": valores}
            continue
        if anterior is None:
            raise ValueError(f"Sem dia observado válido anterior para preencher {iso}.")
        anteriores = por_dia.get(iso, [])
        por_hora = {}
        for registro in anteriores:
            por_hora.setdefault(int(registro[1][:2]), []).append(registro)
        auditoria_horas = []
        for hora in range(24):
            valor = anterior["horas"].get(hora)
            linhas = por_hora.get(hora, [])
            if not linhas:
                registro = [""] * len(cabecalho)
                registro[0] = iso.replace("-", "/")
                registro[1] = f"{hora:02d}00 UTC"
                registros.append(registro)
                linhas = [registro]
            for registro in linhas:
                while len(registro) < len(cabecalho):
                    registro.append("")
                registro[coluna] = "" if valor is None else str(valor).replace(".", ",")
            auditoria_horas.append({"horaUTC": hora, "chuvaCopiadaMm": valor})
        preenchimentos.append(
            {
                "data": iso,
                "origem": anterior["data"],
                "metodo": "copia-da-precipitacao-horaria-do-ultimo-dia-observado-valido",
                "registroDiarioAnterior": dia,
                "horasCopiadas": auditoria_horas,
            }
        )
    if not preenchimentos:
        return conteudo, preenchimentos, anterior
    # Conserva todos os dias da fonte anual e insere eventuais horas ausentes em ordem.
    registros.sort(key=lambda r: (r[0], r[1]))
    saida = io.StringIO(newline="")
    quebra = "\r\n" if b"\r\n" in conteudo else "\n"
    saida.write(quebra.join(texto[:8]) + quebra)
    escritor = csv.writer(saida, delimiter=";", lineterminator=quebra)
    escritor.writerow(cabecalho)
    escritor.writerows(registros)
    tratado = saida.getvalue().encode("latin-1")
    _, leituras_tratadas = ler_csv(tratado)
    diarios = {linha["data"]: linha for linha in dias_normalizados(leituras_tratadas, inicio, fim)}
    for ajuste in preenchimentos:
        ajuste["registroDiarioTratado"] = diarios[ajuste["data"]]
        if diarios[ajuste["data"]]["horas_validas"] < HORAS_MINIMAS:
            raise ValueError(f"Preenchimento não resolveu o dia {ajuste['data']}.")
    return tratado, preenchimentos, anterior


def preparar(raiz: Path, inicio: date = INICIO, fim: date = FIM, aviso=print):
    """Prepara e audita a série, sem modificar o arquivo fonte do INMET."""
    if inicio > fim or inicio < INICIO or fim > FIM:
        raise ValueError(f"Use um intervalo entre {INICIO} e {FIM}.")
    estacao = ESTACAO
    saida = raiz / "preparado" / estacao
    saida.mkdir(parents=True, exist_ok=True)
    manifesto_path = saida / "manifesto.json"
    antigo = (
        json.loads(manifesto_path.read_text(encoding="utf-8")) if manifesto_path.exists() else {}
    )
    if antigo and (antigo.get("versao") != 1 or antigo.get("estacao") != estacao):
        raise ValueError("Manifesto incompatível com a estação configurada.")
    manifesto = {
        "versao": 1,
        "estacao": estacao,
        "inicio": inicio.isoformat(),
        "fim": fim.isoformat(),
        "fonte": "INMET; série derivada para demonstração",
        "regra": f"dia observado válido: >={HORAS_MINIMAS} horas; seco: <{CHUVA_DIA_SECO_MM} mm; "
        "dia incompleto: copiar a precipitação horária do último dia observado válido",
        "preenchimento": "ultimo-dia-observado-valido",
        "anos": {},
    }
    anterior = None
    for ano in range(inicio.year, fim.year + 1):
        de, ate = max(inicio, date(ano, 1, 1)), min(fim, date(ano, 12, 31))
        meta_antiga = antigo.get("anos", {}).get(str(ano), {})
        fonte = saida / f"{ano}-fonte.csv"
        horario = saida / f"{ano}-original.csv"
        diario = saida / f"{ano}-diario.csv"
        registro = {
            "inicio": de.isoformat(),
            "fim": ate.isoformat(),
            "url": URL_DO_ANO.format(ano=ano),
        }
        try:
            if fonte.exists() and sha256(fonte) == (
                meta_antiga.get("sha256Fonte") or meta_antiga.get("sha256Original")
            ):
                conteudo = fonte.read_bytes()
                registro["arquivoNoZip"] = meta_antiga.get("arquivoNoZip")
            elif (
                not meta_antiga.get("sha256Fonte")
                and horario.exists()
                and sha256(horario) == meta_antiga.get("sha256Original")
            ):
                conteudo = horario.read_bytes()
                registro["arquivoNoZip"] = meta_antiga.get("arquivoNoZip")
            else:
                caminho = baixar_ano(ano, raiz / f"{ano}.zip")
                with zipfile.ZipFile(caminho) as z:
                    nomes = [
                        n
                        for n in z.namelist()
                        if n.upper().endswith(".CSV") and f"_{estacao}_" in n.upper()
                    ]
                    if len(nomes) != 1:
                        raise ValueError("Estação ausente ou ambígua no ZIP anual.")
                    conteudo = z.read(nomes[0])
                    registro["arquivoNoZip"] = nomes[0]
            meta, _ = ler_csv(conteudo)
            if meta.codigo.upper() != estacao:
                raise ValueError("Código da estação divergente.")
            tratado, ajustes, anterior = preencher_horario(conteudo, de, ate, anterior)
            _, leituras = ler_csv(tratado)
            linhas = list(dias_normalizados(leituras, de, ate))
            fonte.write_bytes(conteudo)
            horario.write_bytes(tratado)
            temporario = diario.with_suffix(".tmp")
            with temporario.open("w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=COLUNAS)
                w.writeheader()
                w.writerows(linhas)
            temporario.replace(diario)
            registro.update(
                status="preparado",
                versaoPreparo=4,
                arquivoFonte=fonte.name,
                sha256Fonte=sha256(fonte),
                sha256Original=sha256(horario),
                sha256Diario=sha256(diario),
                arquivoHorarioTratado=horario.name,
                dias=len(linhas),
                diasValidos=sum(linha["horas_validas"] >= HORAS_MINIMAS for linha in linhas),
                diasObservadosValidos=len(linhas) - len(ajustes),
                diasPreenchidos=len(ajustes),
                preenchimentos=ajustes,
                primeiroRegistro=min(linha.instante for linha in leituras).isoformat(),
                ultimoRegistro=max(linha.instante for linha in leituras).isoformat(),
                nome=meta.nome,
                latitude=meta.latitude,
                longitude=meta.longitude,
            )
        except Exception as erro:
            registro.update(status="falha", motivo=str(erro))
            anterior = None
        manifesto["anos"][str(ano)] = registro
        # Um preparo interrompido mantém os anos já concluídos auditáveis.
        temporario = manifesto_path.with_suffix(".tmp")
        temporario.write_text(
            json.dumps(manifesto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        temporario.replace(manifesto_path)
        aviso(f"{ano}: {registro['status']}; {registro.get('diasPreenchidos', 0)} dias preenchidos")
    return manifesto
