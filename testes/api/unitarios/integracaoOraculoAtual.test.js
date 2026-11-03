import assert from "node:assert/strict";
import { test } from "node:test";
import { montar } from "./ajuda.js";
const chave = { "X-Chave-De-Servico": "chave-de-teste" };
const endereco = "0x0000000000000000000000000000000000009876";

test("a lista do oráculo exclui apólice sem proposta histórica vinculada", async () => {
  const ctx = await montar();
  try {
    await ctx.banco.query(
      `INSERT INTO apolices (endereco,produtor_carteira,seguradora_carteira,talhao_bytes32,
      hash_termos,valor_indenizacao_wei,tx_emissao,bloco_emissao,situacao)
      VALUES ($1,'0xp','0xs','0x','0x',1,'0x',1,1)`,
      [endereco],
    );
    const r = await ctx.api().get("/api/oraculo/apolices-ativas").set(chave);
    assert.equal(r.status, 200);
    assert.equal(r.body.apolices.length, 0);
  } finally {
    await ctx.fechar();
  }
});

test("repetir relato é idempotente; alterar o conteúdo da mesma transação é recusado", async () => {
  const ctx = await montar();
  try {
    const relato = {
      apolice: endereco,
      periodo: 20240208,
      txHash: "0x" + "ab".repeat(32),
      indiceClimatico: 2,
      gasUsado: "12345",
      enviadoEm: "2026-10-27T12:00:00Z",
      confirmadoEm: "2026-10-27T12:00:02Z",
    };
    const enviar = (dados) => ctx.api().post("/api/oraculo/publicacoes").set(chave).send(dados);
    assert.equal((await enviar(relato)).status, 201);
    assert.equal((await enviar(relato)).status, 201);
    const divergente = await enviar({ ...relato, indiceClimatico: 3 });
    assert.equal(divergente.status, 409, JSON.stringify(divergente.body));
    await ctx.banco.query(
      "UPDATE publicacoes_oraculo SET confirmada_na_cadeia=true WHERE tx_hash=$1",
      [relato.txHash],
    );
    const recuperada = await enviar({ ...relato, recuperada: true, gasUsado: null });
    assert.equal(recuperada.status, 201);
    assert.equal(recuperada.body.confirmadaNaCadeia, true);
    const salvo = (
      await ctx.banco.query(
        "SELECT gas_usado,latencia_ms FROM publicacoes_oraculo WHERE tx_hash=$1",
        [relato.txHash],
      )
    ).rows[0];
    assert.equal(salvo.gas_usado, "12345");
    assert.equal(salvo.latencia_ms, 2000);
    const contagem = (await ctx.banco.query("SELECT count(*)::int AS n FROM publicacoes_oraculo"))
      .rows[0];
    assert.equal(contagem.n, 1);
  } finally {
    await ctx.fechar();
  }
});
