# -*- coding: utf-8 -*-
"""Conferencia manual de uma apolice do AgroSmart, sem usar a API nem o codigo do oraculo.

Entradas: o pacote INMET versionado no repositorio (api/recursos/inmet/A770) e o registro
das consultas JSON-RPC feitas a rede Sepolia na validacao (testes/evidencias/...).
Passos:
  1. conferir os SHA-256 dos arquivos do pacote contra o manifesto e recompor o resumo da serie;
  2. recalcular a sequencia de dias secos desde o inicio da cobertura e o dia a publicar;
  3. recompor o texto dos termos no formato publico (docs/termos-e-vinculo.md) e calcular o Keccak-256;
  4. comparar os resultados com os eventos ApoliceEmitida, IndicesPublicados e CondicaoAvaliada.
Uso: python auditar_apolice.py <raiz-do-repositorio> <cenario-x-sepolia.json> [texto-dos-termos.txt]
O texto dos termos (passo 3) e exibido pela interface na apolice; o identificador da proposta,
um UUID, nao e gravado na cadeia nem consta dos registros publicos da validacao.
"""
import csv, hashlib, json, sys
from datetime import datetime, timedelta
from pathlib import Path

def keccak256(texto: str) -> str:
    from Crypto.Hash import keccak
    k = keccak.new(digest_bits=256); k.update(texto.encode("utf-8")); return "0x" + k.hexdigest()

def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

raiz, registro = Path(sys.argv[1]), json.load(open(sys.argv[2], encoding="utf-8"))
pacote = raiz / "api/recursos/inmet/A770"
manifesto = json.load(open(pacote / "manifesto.json", encoding="utf-8"))
t = registro["termos"]
ini = datetime.fromisoformat(t["inicioUtc"].replace("Z", "+00:00"))
fim = datetime.fromisoformat(t["fimUtc"].replace("Z", "+00:00"))
d0, d1, G = ini.date(), fim.date(), int(t["limiarDias"])

# Passo 1: integridade do pacote e resumo da serie
arquivos = []
for ano in range(d0.year, d1.year + 1):
    meta = manifesto["anos"][str(ano)]
    h_orig = sha256((pacote / f"{ano}-original.csv").read_bytes())
    h_diar = sha256((pacote / f"{ano}-diario.csv").read_bytes())
    assert h_orig == meta["sha256Original"] and h_diar == meta["sha256Diario"], f"pacote {ano} divergente"
    arquivos.append({"ano": ano, "sha256_original": h_orig, "sha256_diario": h_diar})
hash_serie = sha256(json.dumps(arquivos, separators=(",", ":")).encode())
print("1. arquivos do pacote conferem com o manifesto; resumo da serie:", hash_serie)

# Passo 2: contagem desde o inicio da cobertura sobre a serie diaria
dias = {}
for ano in range(d0.year, d1.year + 1):
    with open(pacote / f"{ano}-diario.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            dias[r["data"]] = (None if r["chuva_mm"] == "" else float(r["chuva_mm"]), int(r["horas_validas"]))
S, d, publicado = 0, d0, None
while d <= d1:
    chuva, horas = dias[d.isoformat()]
    assert horas >= 20 and chuva is not None, f"dia nao utilizavel: {d}"
    S = S + 1 if chuva < 1.0 else 0
    if S >= G:
        publicado = (d, S); break
    d += timedelta(days=1)
if publicado is None:
    publicado = (d1, S)
periodo = int(publicado[0].strftime("%Y%m%d"))
print(f"2. recalculo: periodo {periodo}, indice {publicado[1]}, gatilho atingido: {publicado[1] >= G}")

# Passo 3: texto dos termos e Keccak-256
eventos = [e for r in registro["recibos"] for e in r.get("eventos", []) if "nome" in e]
emitida = next(e for e in eventos if e["nome"] == "ApoliceEmitida")["argumentos"]
talhao = bytes.fromhex(emitida["talhao"][2:]).rstrip(b"\0").decode()
def termos(id_proposta):
    return "|".join([
        "AgroSmart:historico:v3", "estacao:A770", f"sha256-serie:{hash_serie}", "parametro:experimental",
        "contagem:inicio-da-cobertura", "dia-seco:chuva-inferior-a-1-mm", "dia-utilizavel:minimo-20-horas-validas",
        "datas:utc-inclusivas", "talhao:coincidente-com-estacao-por-hipotese", "pagamento:integral",
        f"apolice-de-proposta:{id_proposta}", f"produtor:{emitida['produtor'].lower()}", f"talhao:{talhao}",
        "cultura:soja", f"limiar-climatico:{G}", f"limite-wei:{emitida['valorIndenizacao']}",
        f"vigencia-inicio:{int(ini.timestamp())}", f"vigencia-fim:{int(fim.timestamp())}"])
if len(sys.argv) > 3:
    texto = Path(sys.argv[3]).read_text(encoding="utf-8").strip()
    campos = texto.split("|")
    esperado = termos(campos[10].split(":", 1)[1])
    print("3. texto confere campo a campo com a apolice e o pacote:", texto == esperado,
          "| Keccak-256 coincide com ApoliceEmitida.hashTermos:", keccak256(texto) == emitida["hashTermos"].lower())
else:
    print("3. nao executado: falta o texto dos termos exibido pela interface (o UUID da proposta nao esta na cadeia)")

# Passo 4: comparacao com os eventos gravados
pub = next((e for e in eventos if e["nome"] == "IndicesPublicados"), None)
cond = next((e for e in eventos if e["nome"] == "CondicaoAvaliada"), None)
if pub:
    ok = int(pub["argumentos"]["periodo"]) == periodo and int(pub["argumentos"]["indiceClimatico"]) == publicado[1]
    ok_c = bool(cond["argumentos"]["atendida"]) == (publicado[1] >= G)
    print("4. evento IndicesPublicados:", pub["argumentos"]["periodo"], pub["argumentos"]["indiceClimatico"],
          "| coincide:", ok, "| CondicaoAvaliada.atendida:", cond["argumentos"]["atendida"], "| coincide:", ok_c)
