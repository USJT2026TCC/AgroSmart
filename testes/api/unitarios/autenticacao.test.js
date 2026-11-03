import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { sha256Hex } from "../../../api/src/seguranca/cripto.js";
import { com, entrar, montar } from "./ajuda.js";

/**
 * Autenticacao e controle de acesso.
 */
describe("autenticacao", () => {
  let ctx;

  before(async () => {
    ctx = await montar();
  });

  after(() => ctx.fechar());

  test("login com credenciais corretas devolve token e usuario, sem hash", async () => {
    const r = await ctx
      .api()
      .post("/api/autenticacao/entrar")
      .send({ identificador: "produtor", senha: "agrosmart" });

    assert.equal(r.status, 200);
    assert.ok(r.body.token.length >= 40);
    assert.equal(r.body.usuario.perfil, "produtor");
    assert.equal(r.body.usuario.hash_senha, undefined);
    assert.equal(r.body.usuario.hashSenha, undefined);
  });

  test("senha errada e usuario inexistente respondem igual", async () => {
    const errada = await ctx
      .api()
      .post("/api/autenticacao/entrar")
      .send({ identificador: "produtor", senha: "x" });
    const inexistente = await ctx
      .api()
      .post("/api/autenticacao/entrar")
      .send({ identificador: "ninguem", senha: "x" });

    assert.equal(errada.status, 401);
    assert.equal(inexistente.status, 401);
    // A mesma mensagem nos dois casos: nao revela quais identificadores existem.
    assert.equal(errada.body.erro.mensagem, inexistente.body.erro.mensagem);
  });

  test("o identificador nao diferencia maiusculas", async () => {
    const r = await ctx
      .api()
      .post("/api/autenticacao/entrar")
      .send({ identificador: "PRODUTOR", senha: "agrosmart" });
    assert.equal(r.status, 200);
  });

  test("a senha fica guardada com bcrypt, nunca em texto claro", async () => {
    const { rows } = await ctx.banco.query(
      "SELECT hash_senha FROM usuarios WHERE identificador = 'produtor'",
    );

    assert.match(rows[0].hash_senha, /^\$2[aby]\$\d{2}\$/);
    assert.ok(!rows[0].hash_senha.includes("agrosmart"));
  });

  test("o banco guarda o resumo do token, nao o token", async () => {
    const token = await entrar(ctx.api, "produtor");
    const { rows } = await ctx.banco.query("SELECT hash_token FROM sessoes");

    assert.ok(rows.every((s) => s.hash_token !== token));
    assert.ok(rows.some((s) => s.hash_token.length === 64));
  });

  test("rota protegida sem token responde 401", async () => {
    const r = await ctx.api().get("/api/autenticacao/eu");
    assert.equal(r.status, 401);
  });

  test("rota de outro perfil responde 403", async () => {
    const token = await entrar(ctx.api, "produtor");
    const r = await ctx.api().get("/api/produtores").set(com(token));

    assert.equal(r.status, 403);
    assert.equal(r.body.erro.codigo, "sem_permissao");
  });

  test("sessao expirada e recusada", async () => {
    const token = await entrar(ctx.api, "produtor");

    assert.equal((await ctx.api().get("/api/autenticacao/eu").set(com(token))).status, 200);

    await ctx.banco.query(
      "UPDATE sessoes SET expira_em = now() - interval '1 second' WHERE hash_token = $1",
      [sha256Hex(token)],
    );

    assert.equal((await ctx.api().get("/api/autenticacao/eu").set(com(token))).status, 401);
  });

  test("sair revoga a sessao de imediato", async () => {
    const token = await entrar(ctx.api, "seguradora");

    assert.equal((await ctx.api().get("/api/autenticacao/eu").set(com(token))).status, 200);
    assert.equal((await ctx.api().post("/api/autenticacao/sair").set(com(token))).status, 204);
    assert.equal((await ctx.api().get("/api/autenticacao/eu").set(com(token))).status, 401);
  });
});
