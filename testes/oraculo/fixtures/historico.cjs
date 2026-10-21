"use strict";
// Dados sinteticos exclusivos dos testes; nao representam medicoes do INMET.
const fs = require("node:fs"),
  path = require("node:path");
const { createHash } = require("node:crypto");
const { ethers } = require("ethers");
const hash = (x) => createHash("sha256").update(x).digest("hex");
function pacote(dir, linhas) {
  fs.mkdirSync(dir, { recursive: true });
  const original = "fixture sintetica de precipitacao";
  const diario =
    "data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas\r\n" +
    linhas.map((l) => `${l.data},${l.chuva_mm ?? ""},${l.horas_validas},0,0`).join("\r\n") +
    "\r\n";
  const meta = { status: "preparado", sha256Original: hash(original), sha256Diario: hash(diario) };
  fs.writeFileSync(path.join(dir, "2024-original.csv"), original);
  fs.writeFileSync(path.join(dir, "2024-diario.csv"), diario);
  fs.writeFileSync(
    path.join(dir, "manifesto.json"),
    JSON.stringify({ versao: 1, estacao: "A770", anos: { 2024: meta } }),
  );
  return {
    ...meta,
    hashSerie: hash(
      JSON.stringify([
        { ano: 2024, sha256_original: meta.sha256Original, sha256_diario: meta.sha256Diario },
      ]),
    ),
  };
}
function descricao(t) {
  return [
    "AgroSmart:historico:v1",
    "estacao:A770",
    `sha256-serie:${t.hashSerie}`,
    "parametro:experimental",
    "contagem:inicio-da-cobertura",
    "dia-seco:chuva-inferior-a-1-mm",
    "dia-utilizavel:minimo-20-horas-validas",
    "datas:utc-inclusivas",
    `vigencia-inicio:${Date.parse(t.inicioHistorico + "T00:00:00Z") / 1000}`,
    `vigencia-fim:${Date.parse(t.fimHistorico + "T23:59:59Z") / 1000}`,
    `limiar-climatico:${t.limiarClimatico}`,
    "modo:0",
    "limiar-climatico-integral:0",
  ].join("|");
}
function compromisso(t) {
  const texto = descricao(t);
  return { descricaoDosTermos: texto, hashTermos: ethers.keccak256(ethers.toUtf8Bytes(texto)) };
}
module.exports = { pacote, compromisso };
