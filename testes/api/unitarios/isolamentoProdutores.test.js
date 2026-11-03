import assert from "node:assert/strict";
import { test } from "node:test";
import { montar, entrar, com } from "./ajuda.js";
import { abrirSessao } from "../../../api/src/seguranca/sessoes.js";

test("conta fora dos dois acessos fixos não entra nem reutiliza sessão anterior", async () => {
  const ctx = await montar();
  try {
    const seguradora = await entrar(ctx.api, "seguradora");
    const { rows } = await ctx.banco
      .query(`INSERT INTO usuarios (identificador,nome,perfil,hash_senha)
      SELECT 'outro.isolamento','Outro','produtor',hash_senha FROM usuarios WHERE identificador='produtor' RETURNING id`);
    const token = await abrirSessao(ctx.banco, rows[0].id);
    const login = await ctx
      .api()
      .post("/api/autenticacao/entrar")
      .send({ identificador: "outro.isolamento", senha: "agrosmart" });
    assert.equal(login.status, 401);
    for (const rota of ["/api/autenticacao/eu", "/api/talhoes", "/api/propostas"]) {
      assert.equal((await ctx.api().get(rota).set(com(token))).status, 401);
    }
    const lista = await ctx.api().get("/api/produtores").set(com(seguradora));
    assert.deepEqual(
      lista.body.produtores.map((p) => p.identificador),
      ["produtor"],
    );
    const tentativa = await ctx
      .api()
      .post("/api/talhoes")
      .set(com(seguradora))
      .send({
        produtorId: rows[0].id,
        identificador: "outro-talhao",
        cultura: "soja",
        areaHa: "10",
        propriedade: { nome: "Outra", municipio: "São Simão/SP" },
      });
    assert.equal(tentativa.status, 404);
  } finally {
    await ctx.fechar();
  }
});
