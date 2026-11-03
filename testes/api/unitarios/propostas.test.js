import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";

import { ethers } from "ethers";

import { descreverTermos, resumirTermos } from "../../../api/src/dominio/termos.js";
import {
  FABRICA,
  PRODUTOR_NA_CADEIA,
  SEGURADORA_NA_CADEIA,
  com,
  entrar,
  idDoProduto,
  idDoTalhao,
  montar,
  reciboDeEmissao,
} from "./ajuda.js";

/**
 * Cotacao, proposta e emissao verificada na cadeia.
 */

describe("termos e resumo", () => {
  const base = {
    propostaId: "11111111-1111-1111-1111-111111111111",
    carteiraProdutor: PRODUTOR_NA_CADEIA,
    talhao: "talhao-01",
    cultura: "soja",
    areaHa: "180",
    limiarClimatico: 30,
    valorIndenizacaoWei: "6000000000000000",
    vigenciaInicio: 1790000000,
    vigenciaFim: 1805552000,
  };

  test("a descricao e deterministica: os mesmos termos dao sempre o mesmo resumo", () => {
    assert.equal(resumirTermos(descreverTermos(base)), resumirTermos(descreverTermos({ ...base })));
  });

  test("qualquer campo alterado muda o resumo", () => {
    const original = resumirTermos(descreverTermos(base));

    for (const [campo, valor] of [
      ["limiarClimatico", 31],
      ["valorIndenizacaoWei", "1080000000000000001"],
      ["carteiraProdutor", SEGURADORA_NA_CADEIA],
      ["vigenciaFim", base.vigenciaFim + 1],
    ]) {
      assert.notEqual(resumirTermos(descreverTermos({ ...base, [campo]: valor })), original, campo);
    }
  });

  test("a capitalizacao do endereco nao altera o resumo", () => {
    assert.equal(
      resumirTermos(descreverTermos(base)),
      resumirTermos(
        descreverTermos({
          ...base,
          carteiraProdutor: ethers.getAddress(PRODUTOR_NA_CADEIA),
        }),
      ),
    );
  });
});

describe("propostas e emissao", () => {
  let ctx;
  let produtor;
  let seguradora;
  let talhaoId;
  let produtoId;

  const cobertura = {
    inicioDaVigencia: "2024-02-07",
    fimDaVigencia: "2024-02-09",
    gatilhoDias: 2,
  };
  before(async () => {
    ctx = await montar();
    // Tres dias e hashes sinteticos; nao sao medicoes reais.
    await ctx.banco.query(
      "INSERT INTO inmet_arquivos (estacao,ano,sha256_original,sha256_diario,procedencia) VALUES ('A770',2024,$1,$1,'{}')",
      ["0".repeat(64)],
    );
    await ctx.banco.query(
      "INSERT INTO inmet_dias (estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas) VALUES ('A770','2024-02-07',0,24,0,0),('A770','2024-02-08',0,24,0,0),('A770','2024-02-09',3,24,0,0)",
    );
    produtor = await entrar(ctx.api, "produtor");
    seguradora = await entrar(ctx.api, "seguradora");
    talhaoId = await idDoTalhao(ctx.banco);
    produtoId = await idDoProduto(ctx.banco, "Estiagem — soja");
  });

  after(() => ctx.fechar());

  beforeEach(async () => {
    ctx.cadeia.estado.recibos.clear();
    ctx.cadeia.estado.termos.clear();
    // Cada caso parte do talhao livre: a API aceita uma proposta em analise por talhao.
    await ctx.banco.query(
      "UPDATE propostas SET situacao = 'recusada' WHERE situacao IN ('pendente', 'preparada')",
    );
  });

  test("segunda proposta para o mesmo talhao em analise e recusada", async () => {
    await novaProposta();
    const repetida = await ctx
      .api()
      .post("/api/propostas")
      .set(com(produtor))
      .send({ ...cobertura, talhaoId, produtoId });
    assert.equal(repetida.status, 409);
    assert.match(repetida.body.erro.mensagem, /ja tem uma proposta em analise/);

    const invalida = await ctx
      .api()
      .post("/api/propostas")
      .set(com(produtor))
      .send({ ...cobertura, talhaoId, produtoId, gatilhoDias: 0 });
    assert.equal(invalida.status, 400, "dados invalidos continuam respondendo 400");
  });

  async function novaProposta() {
    const r = await ctx
      .api()
      .post("/api/propostas")
      .set(com(produtor))
      .send({ ...cobertura, talhaoId, produtoId });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.proposta;
  }

  async function preparar(id) {
    const r = await ctx.api().post(`/api/propostas/${id}/preparar`).set(com(seguradora));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  }

  /** Simula a emissao na cadeia com os termos informados, e devolve o txHash. */
  function emitirNaCadeia({
    apolice,
    hashTermos,
    produtor: dono = PRODUTOR_NA_CADEIA,
    valor,
    de,
    status,
  }) {
    const txHash = ethers.hexlify(ethers.randomBytes(32));

    ctx.cadeia.estado.recibos.set(
      txHash,
      reciboDeEmissao({
        apolice,
        modoHistorico: true,
        produtor: dono,
        talhao: ethers.encodeBytes32String("talhao-01"),
        valor,
        hashTermos,
        de,
        status,
      }),
    );

    ctx.cadeia.estado.termos.set(apolice.toLowerCase(), {
      modoHistorico: true,
      limiarClimatico: 2,
      vigenciaInicio: 1707264000,
      vigenciaFim: 1707523199,
      produtor: dono.toLowerCase(),
      talhao: ethers.encodeBytes32String("talhao-01"),
      cultura: ethers.encodeBytes32String("soja"),
      valorIndenizacao: String(valor),
      hashTermos,
      seguradora: SEGURADORA_NA_CADEIA,
    });

    return txHash;
  }

  const confirmar = (id, txHash) =>
    ctx.api().post(`/api/propostas/${id}/emissao`).set(com(seguradora)).send({ txHash });

  test("produto de outra cultura e recusado", async () => {
    // Registro sintetico fora do escopo, exclusivo do banco descartavel.
    const talhaoMilho = await idDoTalhao(ctx.banco, "talhao-02");
    await ctx.banco.query("UPDATE talhoes SET cultura='milho' WHERE id=$1", [talhaoMilho]);
    const r = await ctx
      .api()
      .post("/api/cotacoes")
      .set(com(produtor))
      .send({ talhaoId: talhaoMilho, produtoId });

    assert.equal(r.status, 400);
    assert.match(r.body.erro.mensagem, /fora do escopo/);
  });

  test("cotacao recusa localidade fora de Sao Simao em cadastro ja existente", async () => {
    const propriedade = (
      await ctx.banco.query("SELECT propriedade_id FROM talhoes WHERE id=$1", [talhaoId])
    ).rows[0].propriedade_id;
    await ctx.banco.query("UPDATE propriedades SET municipio='Cravinhos/SP' WHERE id=$1", [
      propriedade,
    ]);
    try {
      const resposta = await ctx
        .api()
        .post("/api/cotacoes")
        .set(com(produtor))
        .send({ ...cobertura, talhaoId, produtoId });
      assert.equal(resposta.status, 400);
      assert.match(resposta.body.erro.mensagem, /fora do escopo/);
    } finally {
      await ctx.banco.query("UPDATE propriedades SET municipio='Sao Simao/SP' WHERE id=$1", [
        propriedade,
      ]);
    }
  });

  test("proposta exige carteira vinculada", async () => {
    await ctx.banco.query("UPDATE usuarios SET carteira = NULL WHERE identificador = 'produtor'");

    const r = await ctx
      .api()
      .post("/api/propostas")
      .set(com(produtor))
      .send({ ...cobertura, talhaoId, produtoId, areaHa: "10" });
    assert.equal(r.status, 400);
    assert.match(r.body.erro.mensagem, /Vincule a carteira/);

    await ctx.banco.query("UPDATE usuarios SET carteira = $1 WHERE identificador = 'produtor'", [
      PRODUTOR_NA_CADEIA,
    ]);
  });

  test("preparar preserva os dias historicos UTC na struct de emissao", async () => {
    const proposta = await novaProposta();
    const preparo = await preparar(proposta.id);

    assert.equal(preparo.fabrica, FABRICA);
    assert.equal(preparo.termos.valorIndenizacao, "6000000000000000");
    assert.equal(preparo.termos.vigenciaInicio, Date.parse("2024-02-07T00:00:00Z") / 1000);
    assert.equal(preparo.termos.vigenciaFim, Date.parse("2024-02-09T23:59:59Z") / 1000);
    const { rows: guardadas } = await ctx.banco.query(
      "SELECT descricao_dos_termos FROM propostas WHERE hash_termos = $1",
      [preparo.hashTermos],
    );
    assert.equal(preparo.termos.hashTermos, resumirTermos(guardadas[0].descricao_dos_termos));
    assert.equal(ethers.decodeBytes32String(preparo.termos.talhao), "talhao-01");
  });

  test("emissao correta liga a apolice a proposta", async () => {
    const proposta = await novaProposta();
    const { hashTermos } = await preparar(proposta.id);
    const apolice = ethers.Wallet.createRandom().address;

    const txHash = emitirNaCadeia({
      apolice,
      hashTermos,
      valor: 6_000_000_000_000_000n,
    });
    const r = await confirmar(proposta.id, txHash);

    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.apolice.endereco, apolice.toLowerCase());

    const lista = await ctx.api().get("/api/propostas").set(com(produtor));
    const atualizada = lista.body.propostas.find((p) => p.id === proposta.id);
    assert.equal(atualizada.situacao, "emitida");
    assert.equal(atualizada.apolice.endereco, apolice.toLowerCase());
  });

  test("confirmar duas vezes a mesma emissao e idempotente", async () => {
    const proposta = await novaProposta();
    const { hashTermos } = await preparar(proposta.id);
    const apolice = ethers.Wallet.createRandom().address;
    const txHash = emitirNaCadeia({
      apolice,
      hashTermos,
      valor: 6_000_000_000_000_000n,
    });

    assert.equal((await confirmar(proposta.id, txHash)).status, 200);

    const segunda = await confirmar(proposta.id, txHash);
    assert.equal(segunda.status, 200);
    assert.equal(segunda.body.nova, false);

    const { rows } = await ctx.banco.query(
      "SELECT count(*)::int AS n FROM apolices WHERE endereco = $1",
      [apolice.toLowerCase()],
    );
    assert.equal(rows[0].n, 1);
  });

  describe("campos executaveis da emissao", () => {
    for (const [campo, adulterado] of [
      ["limiarClimatico", 3],
      ["vigenciaInicio", 1707350400],
      ["vigenciaFim", 1707609599],
      ["talhao", ethers.encodeBytes32String("outro")],
      ["cultura", ethers.encodeBytes32String("milho")],
      ["hashTermos", ethers.id("falso")],
      ["limiarClimatico", undefined],
    ]) {
      test(`recusa ${campo} divergente ou ausente apesar do hash certo no evento`, async () => {
        const proposta = await novaProposta();
        const { hashTermos } = await preparar(proposta.id);
        const apolice = ethers.Wallet.createRandom().address;
        const txHash = emitirNaCadeia({ apolice, hashTermos, valor: 6_000_000_000_000_000n });
        ctx.cadeia.estado.termos.get(apolice.toLowerCase())[campo] = adulterado;
        const resposta = await confirmar(proposta.id, txHash);
        assert.equal(resposta.status, 400, JSON.stringify(resposta.body));
        assert.equal(resposta.body.erro.codigo, "emissao_divergente");
        const registradas = await ctx.banco.query("SELECT id FROM apolices WHERE endereco=$1", [
          apolice.toLowerCase(),
        ]);
        assert.equal(registradas.rows.length, 0);
        const persistida = await ctx.banco.query("SELECT situacao FROM propostas WHERE id=$1", [
          proposta.id,
        ]);
        assert.equal(persistida.rows[0].situacao, "preparada");
      });
    }
  });

  describe("o que a verificacao precisa recusar", () => {
    test("transacao que ainda nao esta na rede", async () => {
      const proposta = await novaProposta();
      await preparar(proposta.id);

      const r = await confirmar(proposta.id, ethers.hexlify(ethers.randomBytes(32)));
      assert.equal(r.status, 409);
    });

    test("transacao revertida", async () => {
      const proposta = await novaProposta();
      const { hashTermos } = await preparar(proposta.id);
      const txHash = emitirNaCadeia({
        apolice: ethers.Wallet.createRandom().address,
        hashTermos,
        valor: 6_000_000_000_000_000n,
        status: 0,
      });

      const r = await confirmar(proposta.id, txHash);
      assert.equal(r.status, 400);
      assert.match(r.body.erro.mensagem, /revertida/);
    });

    test("evento emitido por um contrato que nao e a fabrica oficial", async () => {
      const proposta = await novaProposta();
      const { hashTermos } = await preparar(proposta.id);

      // Um contrato qualquer emite um evento com o mesmo nome e os mesmos campos.
      // O que prova a origem e o endereco de quem emitiu o log.
      const txHash = emitirNaCadeia({
        apolice: ethers.Wallet.createRandom().address,
        hashTermos,
        valor: 6_000_000_000_000_000n,
        de: "0x000000000000000000000000000000000000dead",
      });

      const r = await confirmar(proposta.id, txHash);
      assert.equal(r.status, 400);
      assert.match(r.body.erro.mensagem, /nao emitiu nenhuma apolice/);
    });

    test("resumo dos termos gravado no contrato diferente do gerado para a proposta", async () => {
      const proposta = await novaProposta();
      await preparar(proposta.id);

      const txHash = emitirNaCadeia({
        apolice: ethers.Wallet.createRandom().address,
        hashTermos: ethers.keccak256(ethers.toUtf8Bytes("termos adulterados")),
        valor: 6_000_000_000_000_000n,
      });

      const r = await confirmar(proposta.id, txHash);
      assert.equal(r.status, 400);
      assert.match(r.body.erro.mensagem, /resumo dos termos/);
    });

    test("beneficiario no contrato diferente do produtor da proposta", async () => {
      const proposta = await novaProposta();
      const { hashTermos } = await preparar(proposta.id);

      const txHash = emitirNaCadeia({
        apolice: ethers.Wallet.createRandom().address,
        hashTermos,
        valor: 6_000_000_000_000_000n,
        produtor: ethers.Wallet.createRandom().address,
      });

      const r = await confirmar(proposta.id, txHash);
      assert.equal(r.status, 400);
      assert.match(r.body.erro.mensagem, /carteira beneficiaria/);
    });

    test("limite no contrato diferente do cotado", async () => {
      const proposta = await novaProposta();
      const { hashTermos } = await preparar(proposta.id);

      const txHash = emitirNaCadeia({
        apolice: ethers.Wallet.createRandom().address,
        hashTermos,
        valor: 2_000_000_000_000_000_000n,
      });

      const r = await confirmar(proposta.id, txHash);
      assert.equal(r.status, 400);
      assert.match(r.body.erro.mensagem, /limite/);
    });

    test("confirmar sem ter preparado", async () => {
      const proposta = await novaProposta();
      const r = await confirmar(proposta.id, ethers.hexlify(ethers.randomBytes(32)));

      assert.equal(r.status, 409);
    });

    test("o produtor nao prepara nem confirma emissao", async () => {
      const proposta = await novaProposta();

      assert.equal(
        (await ctx.api().post(`/api/propostas/${proposta.id}/preparar`).set(com(produtor))).status,
        403,
      );
      assert.equal(
        (
          await ctx
            .api()
            .post(`/api/propostas/${proposta.id}/emissao`)
            .set(com(produtor))
            .send({ txHash: "0x" + "1".repeat(64) })
        ).status,
        403,
      );
    });
  });

  test("proposta recusada nao pode ser preparada", async () => {
    const proposta = await novaProposta();

    assert.equal(
      (await ctx.api().post(`/api/propostas/${proposta.id}/recusar`).set(com(seguradora))).status,
      204,
    );
    assert.equal(
      (await ctx.api().post(`/api/propostas/${proposta.id}/preparar`).set(com(seguradora))).status,
      409,
    );
  });
});
