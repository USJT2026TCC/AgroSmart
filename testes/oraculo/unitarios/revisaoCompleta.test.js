"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { criarTemporario } = require("../fixtures/temporario.cjs");
const { FilaDePublicacoes } = require("../../../oraculo/src/fila.js");
const { ServicoOraculo } = require("../../../oraculo/src/oraculo.js");

test("aviso de falha com API offline sobrevive ao reinício e não reenvia a publicação", async () => {
  const arquivo = path.join(criarTemporario("oraculo-falha-api-"), "fila.json");
  let envios = 0,
    avisos = 0,
    offline = true;
  const publicador = {
    publicar: async () => {
      envios++;
      const erro = new Error("recusa definitiva sintética");
      erro.definitivo = true;
      throw erro;
    },
  };
  const backend = {
    relatarFalha: async (dados) => {
      if (offline) throw new Error("API offline");
      assert.equal(dados.periodo, 20240208);
      assert.match(dados.motivo, /recusa definitiva/);
      avisos++;
    },
  };
  const criar = () =>
    new ServicoOraculo({
      publicador,
      backend,
      fila: new FilaDePublicacoes(arquivo),
      opcoes: { esperaBaseMs: 0 },
    });
  let servico = criar();
  const entrada = servico.fila.enfileirar({
    apolice: "0xa",
    periodo: 20240208,
    payload: { indiceClimatico: 2 },
  }).entrada;
  await servico.publicarEntrada(entrada);
  assert.equal(entrada.estado, "falha");
  assert.equal(entrada.relatoFalhaPendente, true);
  assert.equal(envios, 1);
  servico = criar();
  offline = false;
  await servico.drenarFila();
  assert.equal(avisos, 1);
  assert.equal(envios, 1);
  assert.equal(servico.fila.entradas[0].relatoFalhaPendente, false);
  servico = criar();
  await servico.drenarFila();
  assert.equal(avisos, 1);
  assert.equal(envios, 1);
});

test("comandos recusam argumentos soltos, opções duplicadas e valor para uma-vez", () => {
  const cli = path.resolve(__dirname, "../../../oraculo/src/index.js");
  for (const args of [
    ["fila", "antigo"],
    ["servico", "--intervalo", "1000", "--intervalo", "2000"],
    ["servico", "--uma-vez", "false"],
  ]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Opcao|argumento/);
  }
});
