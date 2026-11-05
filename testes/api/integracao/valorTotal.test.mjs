import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { abrirBancoDeTeste } from "../fixtures/banco.js";
import { inicializarBanco } from "../../../api/src/banco/inicializar.js";
import { semear } from "../../../api/src/banco/semente.js";
import { criarApp } from "../../../api/src/app.js";
import { cadeiaFalsa, entrar, com } from "../fixtures/ajuda.js";
const require = createRequire(new URL("../../../api/package.json", import.meta.url));
const request = require("supertest");

test("valor exato configurado percorre cotação, proposta e termos; cliente não altera a indenização", async () => {
  const banco = await abrirBancoDeTeste();
  try {
    await inicializarBanco(banco);
    await semear(banco);
    await inicializarBanco(banco);
    const app = criarApp({ banco, cadeia: cadeiaFalsa() });
    const api = () => request(app);
    const produtor = await entrar(api, "produtor");
    const seguradora = await entrar(api, "seguradora");
    const talhoes = await api().get("/api/talhoes").set(com(produtor));
    assert.equal(talhoes.status, 200);
    const talhaoId = talhoes.body.talhoes[0].id;
    // Valor sintético configurado somente neste banco descartável.
    await banco.query(
      "UPDATE produtos SET valor_indenizacao_wei='12345678901234567' WHERE cultura='soja'",
    );
    const produtoId = (await api().get("/api/produtos").set(com(produtor))).body.produtos[0].id;
    await banco.query(
      "INSERT INTO inmet_arquivos (estacao,ano,sha256_original,sha256_diario,procedencia) VALUES ('A770',2024,$1,$1,'{}')",
      ["0".repeat(64)],
    );
    await banco.query(
      "INSERT INTO inmet_dias (estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas) VALUES ('A770','2024-02-07',0,24,0,0),('A770','2024-02-08',0,24,0,0),('A770','2024-02-09',3,24,0,0)",
    );
    const dados = {
      talhaoId,
      produtoId,
      inicioDaVigencia: "2024-02-07",
      fimDaVigencia: "2024-02-09",
      gatilhoDias: 2,
    };
    const cotacao = await api()
      .post("/api/cotacoes")
      .set(com(produtor))
      .send({ ...dados, valorIndenizacaoWei: "999" });
    assert.equal(cotacao.status, 200, JSON.stringify(cotacao.body));
    assert.equal(cotacao.body.cotacao.valorIndenizacaoWei, "12345678901234567");
    await banco.query(
      "UPDATE usuarios SET carteira='0x70997970c51812dc3a010c7d01b50e0d17dc79c8' WHERE identificador='produtor'",
    );
    const sessao = await entrar(api, "produtor");
    const proposta = await api().post("/api/propostas").set(com(sessao)).send(dados);
    assert.equal(proposta.status, 201, JSON.stringify(proposta.body));
    assert.equal(proposta.body.proposta.valorIndenizacaoWei, "12345678901234567");
    const preparo = await api()
      .post(`/api/propostas/${proposta.body.proposta.id}/preparar`)
      .set(com(seguradora));
    assert.equal(preparo.status, 200, JSON.stringify(preparo.body));
    assert.equal(preparo.body.termos.valorIndenizacao, "12345678901234567");
    const { conferirVinculo } = require("../oraculo/src/vinculoHistorico.js");
    const descricao = (
      await banco.query("SELECT descricao_dos_termos FROM propostas WHERE id=$1", [
        proposta.body.proposta.id,
      ])
    ).rows[0].descricao_dos_termos;
    assert.doesNotThrow(() =>
      conferirVinculo(
        {
          termos: proposta.body.proposta.termos,
          descricaoDosTermos: descricao,
          hashTermos: preparo.body.hashTermos,
        },
        { ...preparo.body.termos, hashTermos: preparo.body.hashTermos },
      ),
    );
    const colunas = (
      await banco.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='talhoes' ORDER BY column_name",
      )
    ).rows.map((v) => v.column_name);
    assert.deepEqual(colunas, [
      "area_ha",
      "criado_em",
      "cultura",
      "id",
      "identificador",
      "propriedade_id",
    ]);
    const extensoes = (await banco.query("SELECT extname FROM pg_extension")).rows;
    assert.deepEqual(
      extensoes.map((v) => v.extname),
      ["plpgsql"],
    );
  } finally {
    await banco.fechar();
  }
});
