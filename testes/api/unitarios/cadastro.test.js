import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { inicializarBanco } from "../../../api/src/banco/inicializar.js";

import { com, entrar, montar } from "./ajuda.js";

/**
 * Cadastro de talhoes do produtor fixo e consulta do produto da demonstracao.
 */
describe("cadastro", () => {
  let ctx;
  let seguradora;
  let produtor;
  let produtorId;

  before(async () => {
    ctx = await montar();
    seguradora = await entrar(ctx.api, "seguradora");
    produtor = await entrar(ctx.api, "produtor");
    produtorId = (await ctx.banco.query("SELECT id FROM usuarios WHERE identificador = 'produtor'"))
      .rows[0].id;
  });

  after(() => ctx.fechar());

  const novoTalhao = (extra = {}) => ({
    produtorId,
    identificador: `t-${Math.random().toString(36).slice(2, 8)}`,
    cultura: "soja",
    propriedade: {
      nome: "Fazenda Santa Clara",
      municipio: "Sao Simao/SP",
    },
    areaHa: "180",
    ...extra,
  });

  describe("talhoes", () => {
    test("recusa area ausente, zero, negativa, acima do limite ou com precisao excessiva", async () => {
      for (const areaHa of [undefined, "0", "-1", "10000000000", "1.23456"]) {
        const r = await ctx
          .api()
          .post("/api/talhoes")
          .set(com(seguradora))
          .send(novoTalhao({ areaHa }));
        assert.equal(r.status, 400, JSON.stringify(r.body));
      }
    });

    test("identificador acima de 31 bytes e recusado, porque vai para a cadeia como bytes32", async () => {
      const r = await ctx
        .api()
        .post("/api/talhoes")
        .set(com(seguradora))
        .send(novoTalhao({ identificador: "a".repeat(32) }));

      assert.equal(r.status, 400);
    });

    test("identificador repetido e recusado com 409", async () => {
      const r = await ctx
        .api()
        .post("/api/talhoes")
        .set(com(seguradora))
        .send(novoTalhao({ identificador: "talhao-01" }));
      assert.equal(r.status, 409);
    });

    test("o produtor ve apenas os proprios talhoes e nao cadastra", async () => {
      const lista = await ctx.api().get("/api/talhoes").set(com(produtor));
      assert.equal(lista.status, 200);
      assert.ok(lista.body.talhoes.every((t) => t.produtor.id === produtorId));

      const cadastro = await ctx.api().post("/api/talhoes").set(com(produtor)).send(novoTalhao());
      assert.equal(cadastro.status, 403);
    });
  });

  test("seguradora cadastra vários talhões no mesmo perfil fixo", async () => {
    for (const identificador of ["talhao-extra-1", "talhao-extra-2"]) {
      const r = await ctx
        .api()
        .post("/api/talhoes")
        .set(com(seguradora))
        .send(novoTalhao({ identificador }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.talhao.produtor.id, produtorId);
    }
    const lista = await ctx.api().get("/api/talhoes").set(com(produtor));
    for (const nome of ["talhao-extra-1", "talhao-extra-2"])
      assert.ok(lista.body.talhoes.some((t) => t.identificador === nome));
  });

  test("escopo fixo rejeita outras culturas e municipios", async () => {
    for (const cultura of ["milho", "cafe", "cana"]) {
      const talhao = await ctx
        .api()
        .post("/api/talhoes")
        .set(com(seguradora))
        .send(novoTalhao({ cultura }));
      assert.equal(talhao.status, 400);
    }
    const novo = await ctx
      .api()
      .post("/api/talhoes")
      .set(com(seguradora))
      .send(
        novoTalhao({ propriedade: { nome: "Outra localidade", municipio: "Ribeirao Preto/SP" } }),
      );
    assert.equal(novo.status, 400);
  });

  describe("produto da demonstracao", () => {
    test("a lista traz so o produto de soja ativo", async () => {
      const r = await ctx.api().get("/api/produtos").set(com(produtor));
      assert.equal(r.status, 200);
      assert.ok(r.body.produtos.length >= 1);
      assert.ok(r.body.produtos.every((p) => p.cultura === "soja" && p.ativo));
    });
  });

  test("rotas de cadastro fora da demonstracao nao existem", async () => {
    const propriedade = (await ctx.api().get("/api/propriedades").set(com(seguradora))).body
      .propriedades[0];
    const { rows } = await ctx.banco.query("SELECT id FROM talhoes LIMIT 1");
    const chamadas = [
      ["post", "/api/produtores"],
      ["patch", `/api/produtores/${produtorId}`],
      ["patch", `/api/propriedades/${propriedade.id}`],
      ["get", `/api/talhoes/${rows[0].id}`],
      ["patch", `/api/talhoes/${rows[0].id}`],
      ["post", "/api/produtos"],
      ["delete", "/api/produtos/00000000-0000-0000-0000-000000000000"],
    ];
    for (const [metodo, caminho] of chamadas) {
      const r = await ctx.api()[metodo](caminho).set(com(seguradora)).send({});
      assert.equal(r.status, 404, `${metodo.toUpperCase()} ${caminho}`);
    }
    const lista = await ctx.api().get("/api/produtores").set(com(seguradora));
    assert.deepEqual(
      lista.body.produtores.map((p) => p.identificador),
      ["produtor"],
    );
  });

  test("talhao com apolice nao pode ser removido", async () => {
    const { rows } = await ctx.banco.query(
      "SELECT id FROM talhoes WHERE identificador = 'talhao-01'",
    );
    await ctx.banco.query(
      `INSERT INTO apolices (endereco, talhao_id, produtor_carteira, seguradora_carteira, talhao_bytes32,
                             hash_termos, valor_indenizacao_wei, tx_emissao, bloco_emissao)
       VALUES ('0xremocao', $1, '0xp', '0xs', '0x', '0x', 1, '0xtx', 1)`,
      [rows[0].id],
    );

    const r = await ctx.api().delete(`/api/talhoes/${rows[0].id}`).set(com(seguradora));
    assert.equal(r.status, 409);
  });
});
