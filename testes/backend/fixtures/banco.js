import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { abrirPostgres } from "../../../backend/src/banco/conexao.js";
import {
  ambienteDoBanco,
  configuracaoDoBanco,
  iniciarBanco,
} from "../../../scripts/banco.mjs";
const require = createRequire(
  new URL("../../../backend/package.json", import.meta.url),
);
const { Client } = require("pg");
let pronto;
async function servidor() {
  if (!pronto)
    pronto = (async () => {
      const ambiente = ambienteDoBanco();
      const config = configuracaoDoBanco(ambiente);
      // Apenas o servidor e compartilhado. Cada teste cria seu proprio banco vazio.
      await iniciarBanco(config);
      return config.url;
    })();
  return pronto;
}
export async function abrirBancoDeTeste() {
  const urlBase = new URL(await servidor());
  const nome = `agrosmart_teste_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(urlBase);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.href });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${nome}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(urlBase);
  url.pathname = `/${nome}`;
  const banco = await abrirPostgres(url.href);
  const fecharPool = banco.fechar;
  let fechado = false;
  banco.fechar = async () => {
    if (fechado) return;
    await fecharPool();
    // Nunca apagar o banco de uso: somente nomes aleatorios criados por este helper.
    if (
      !/^agrosmart_teste_[0-9a-f]{32}$/.test(nome) ||
      new URL(urlBase).pathname === `/${nome}`
    )
      throw new Error("Nome de banco de teste invalido.");
    const controle = new Client({ connectionString: adminUrl.href });
    await controle.connect();
    try {
      await controle.query(`DROP DATABASE "${nome}" WITH (FORCE)`);
      fechado = true;
    } finally {
      await controle.end();
    }
  };
  return banco;
}
