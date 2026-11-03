import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { com, entrar, montar } from "./ajuda.js";
import { periodo } from "../../../api/src/validacao.js";

describe("API no escopo histórico atual", () => {
  let ctx, produtor;
  before(async () => {
    ctx = await montar();
    produtor = await entrar(ctx.api, "produtor");
  });
  after(() => ctx.fechar());

  test("relatos recusam datas impossíveis e datas fora da série, incluindo chamadas diretas", async () => {
    assert.equal(periodo(20200229), 20200229);
    for (const p of [20191231, 20261001, 20230229, 20240431, 20241301]) {
      assert.throws(() => periodo(p), { status: 400 });
      const r = await ctx
        .api()
        .post("/api/oraculo/falhas")
        .set("X-Chave-De-Servico", "chave-de-teste")
        .send({
          apolice: "0x0000000000000000000000000000000000001234",
          periodo: p,
          motivo: "teste",
          tentativas: 1,
        });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    }
  });

  test("a duração é calculada pelas datas escolhidas, sem prazo fixo do produto", async () => {
    await ctx.banco.query(
      `INSERT INTO inmet_arquivos (estacao,ano,sha256_original,sha256_diario,procedencia)
      VALUES ('A770',2024,$1,$1,'{}')`,
      ["0".repeat(64)],
    );
    await ctx.banco
      .query(`INSERT INTO inmet_dias (estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas)
      VALUES ('A770','2024-02-07',0,24,0,0),('A770','2024-02-08',0,24,0,0),('A770','2024-02-09',2,24,0,0)`);
    const produtos = (await ctx.api().get("/api/produtos").set(com(produtor))).body.produtos;
    assert.ok(produtos.length);
    assert.equal("vigenciaDias" in produtos[0], false);
    const talhao = (await ctx.api().get("/api/talhoes").set(com(produtor))).body.talhoes[0];
    const r = await ctx.api().post("/api/propostas").set(com(produtor)).send({
      talhaoId: talhao.id,
      produtoId: produtos[0].id,
      inicioDaVigencia: "2024-02-07",
      fimDaVigencia: "2024-02-09",
      gatilhoDias: 2,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.proposta.termos.vigenciaDias, 3);
    assert.equal(r.body.proposta.termos.inicioHistorico, "2024-02-07");
    assert.equal("inicioDesejado" in r.body.proposta, false);
  });
});
