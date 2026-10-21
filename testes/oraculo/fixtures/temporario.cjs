"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const base = path.resolve(__dirname, "../../gerados/oraculo");
function criarTemporario(prefixo) {
  if (!/^[a-z-]+$/.test(prefixo)) throw new Error("Prefixo de teste invalido.");
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefixo));
}
function limparTemporario(diretorio) {
  const alvo = path.resolve(diretorio);
  if (path.dirname(alvo) !== base) throw new Error("Limpeza fora da pasta de testes bloqueada.");
  fs.rmSync(alvo, { recursive: true, force: true });
}
module.exports = { criarTemporario, limparTemporario };
