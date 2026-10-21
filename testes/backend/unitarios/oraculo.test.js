import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { ethers } from "ethers";

import { PRODUTOR_NA_CADEIA, com, entrar, montar } from "./ajuda.js";

/** API autenticada: relatos e falhas; ingestao de sensores foi retirada. */
describe("API do oraculo", () => {
  let ctx;
  const CHAVE = { "X-Chave-De-Servico": "chave-de-teste" };
  const APOLICE = "0x00000000000000000000000000000000000a1b2c";

  before(async () => {
    ctx = await montar();

    const talhao = (
      await ctx.banco.query(
        "SELECT id FROM talhoes WHERE identificador = 'talhao-01'",
      )
    ).rows[0].id;

    await ctx.banco.query(
      `INSERT INTO apolices (endereco, talhao_id, produtor_carteira, seguradora_carteira, talhao_bytes32,
                             hash_termos, valor_indenizacao_wei, tx_emissao, bloco_emissao, situacao)
       VALUES ($1, $2, $3, '0x0', $4, $5, '1000000000000000000', $6, 1, 1)`,
      [
        APOLICE,
        talhao,
        PRODUTOR_NA_CADEIA,
        ethers.encodeBytes32String("talhao-01"),
        ethers.ZeroHash,
        ethers.ZeroHash,
      ],
    );
  });

  after(() => ctx.fechar());

  test("toda rota exige a chave de servico", async () => {
    assert.equal(
      (await ctx.api().get("/api/oraculo/apolices-ativas")).status,
      401,
    );
    assert.equal(
      (
        await ctx
          .api()
          .get("/api/oraculo/apolices-ativas")
          .set("X-Chave-De-Servico", "errada")
      ).status,
      401,
    );

    // Nem uma sessao de seguradora serve: e outra forma de autenticacao.
    const token = await entrar(ctx.api, "seguradora");
    assert.equal(
      (await ctx.api().get("/api/oraculo/apolices-ativas").set(com(token)))
        .status,
      401,
    );
  });

  test("lista as apolices ativas sem cadastro de sensores", async () => {
    const r = await ctx.api().get("/api/oraculo/apolices-ativas").set(CHAVE);

    assert.equal(r.status, 200);
    assert.equal(r.body.apolices.length, 1);
    assert.equal(r.body.apolices[0].talhao, "talhao-01");
    assert.equal("fontes" in r.body.apolices[0], false);
  });

  test("rotas de sensores removidas respondem 404", async () => {
    const token = await entrar(ctx.api, "seguradora");
    for (const [metodo, rota] of [
      ["post", "/leituras"],
      ["get", "/fontes"],
      ["post", "/fontes"],
      ["patch", "/fontes/antiga"],
      ["get", "/oraculo/leituras"],
    ]) {
      const r = await ctx
        .api()
        [metodo](`/api${rota}`)
        .set(com(token))
        .set(CHAVE)
        .send({});
      assert.equal(r.status, 404, rota);
    }
    assert.equal(
      (await ctx.banco.query("SELECT count(*)::int AS n FROM fontes")).rows[0]
        .n,
      0,
    );
  });

  test("confirmacao exige hash da transacao e indice do evento correspondentes", async () => {
    const hash = "0x" + "11".repeat(32);
    await ctx.banco.query(
      `INSERT INTO eventos_cadeia (contrato, nome, bloco, indice_log, tx_hash, argumentos, instante)
      VALUES ($1, 'IndicesPublicados', 1, 0, $2, $3, now())`,
      [
        APOLICE,
        hash,
        JSON.stringify({ periodo: 20240208, indiceClimatico: 2 }),
      ],
    );
    const relatar = (txHash, indiceClimatico) =>
      ctx
        .api()
        .post("/api/oraculo/publicacoes")
        .set(CHAVE)
        .send({ apolice: APOLICE, periodo: 20240208, txHash, indiceClimatico });
    assert.equal(
      (await relatar("0x" + "22".repeat(32), 2)).body.confirmadaNaCadeia,
      false,
    );
    await ctx.banco.query(
      "DELETE FROM publicacoes_oraculo WHERE apolice_endereco=$1 AND periodo=20240208",
      [APOLICE],
    );
    assert.equal((await relatar(hash, 3)).body.confirmadaNaCadeia, false);
    // Remove somente o relato sintetico incorreto deste teste antes da tentativa correta.
    await ctx.banco.query(
      "DELETE FROM publicacoes_oraculo WHERE tx_hash = $1",
      [hash],
    );
    const correta = await relatar(hash, 2);
    assert.equal(correta.status, 201, JSON.stringify(correta.body));
    assert.equal(correta.body.confirmadaNaCadeia, true);
  });

  test("relato com datas ou custos invalidos responde 400", async () => {
    const base = {
      apolice: APOLICE,
      periodo: 20240208,
      txHash: "0x" + "33".repeat(32),
      indiceClimatico: 2,
    };
    for (const extra of [
      { enviadoEm: "invalida" },
      { gasUsado: "abc" },
      { custoWei: "-1" },
      { enviadoEm: "2024-02-09", confirmadoEm: "2024-02-08" },
    ]) {
      assert.equal(
        (
          await ctx
            .api()
            .post("/api/oraculo/publicacoes")
            .set(CHAVE)
            .send({ ...base, ...extra })
        ).status,
        400,
      );
    }
  });

  test("o relato de publicacao fica pendente ate o evento aparecer na cadeia (RF22)", async () => {
    const txHash = ethers.hexlify(ethers.randomBytes(32));

    const r = await ctx
      .api()
      .post("/api/oraculo/publicacoes")
      .set(CHAVE)
      .send({
        apolice: APOLICE,
        periodo: 20261006,
        txHash,
        indiceClimatico: 35,
        gasUsado: "231849",
        gasEstimado: "240000",
        enviadoEm: "2026-10-06T12:00:00.000Z",
        confirmadoEm: "2026-10-06T12:00:00.180Z",
        acionouPagamento: true,
        procedencia: { fontesUsadas: ["estacao-inmet-a770"] },
      });

    assert.equal(r.status, 201);
    assert.equal(r.body.confirmadaNaCadeia, false);

    const { rows } = await ctx.banco.query(
      "SELECT latencia_ms, gas_usado FROM publicacoes_oraculo WHERE tx_hash = $1",
      [txHash.toLowerCase()],
    );
    assert.equal(rows[0].latencia_ms, 180);
    assert.equal(rows[0].gas_usado, "231849");
  });

  test("recibo recuperado nao inventa latencia original", async () => {
    const txHash = "0x" + "44".repeat(32);
    await ctx.banco.query(
      "DELETE FROM publicacoes_oraculo WHERE apolice_endereco=$1 AND periodo=20240208",
      [APOLICE],
    );
    const r = await ctx
      .api()
      .post("/api/oraculo/publicacoes")
      .set(CHAVE)
      .send({
        apolice: APOLICE,
        periodo: 20240208,
        txHash,
        indiceClimatico: 2,
        recuperada: true,
        enviadoEm: "2024-02-08T10:00:00Z",
        confirmadoEm: "2024-02-09T10:00:00Z",
      });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(
      (
        await ctx.banco.query(
          "SELECT latencia_ms FROM publicacoes_oraculo WHERE tx_hash=$1",
          [txHash],
        )
      ).rows[0].latencia_ms,
      null,
    );
  });

  test("falha de publicacao notifica a seguradora uma unica vez (RF27)", async () => {
    const falha = {
      apolice: APOLICE,
      periodo: 20261007,
      motivo: "ECONNREFUSED",
      tentativas: 5,
    };

    assert.equal(
      (await ctx.api().post("/api/oraculo/falhas").set(CHAVE).send(falha))
        .status,
      201,
    );
    assert.equal(
      (await ctx.api().post("/api/oraculo/falhas").set(CHAVE).send(falha))
        .status,
      201,
    );

    const token = await entrar(ctx.api, "seguradora");
    const r = await ctx.api().get("/api/notificacoes").set(com(token));

    const falhas = r.body.notificacoes.filter(
      (n) => n.tipo === "falha_de_publicacao",
    );
    assert.equal(falhas.length, 1);
    assert.match(falhas[0].mensagem, /20261007/);
  });
});
