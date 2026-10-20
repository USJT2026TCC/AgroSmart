"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { avaliarHistorico } = require("../../../oraculo/src/historico");
const linha = (data, chuva = 0, horas = 24) => ({
  data,
  chuva_mm: chuva,
  horas_validas: horas,
});
test("contagem comeca na cobertura, nao no primeiro dado", () => {
  const r = avaliarHistorico({
    linhas: [linha("2024-01-01"), linha("2024-01-02"), linha("2024-01-03")],
    inicio: "2024-01-02",
    fim: "2024-01-03",
    gatilho: 3,
  });
  assert.equal(r.maiorSequencia, 2);
  assert.equal(r.acionaria, false);
});
test("chuva e lacuna interrompem; primeiro acionamento fica preservado", () => {
  const r = avaliarHistorico({
    linhas: [
      linha("2024-01-01"),
      linha("2024-01-02"),
      linha("2024-01-03", 10),
      linha("2024-01-05"),
    ],
    inicio: "2024-01-01",
    fim: "2024-01-05",
    gatilho: 2,
  });
  assert.equal(r.primeiroAcionamento, "2024-01-02");
  assert.equal(r.diasIncompletos, 1);
  assert.equal(r.percentualBps, 10000);
  assert.equal(r.dias[4].indiceClimatico, 1);
});
test("dia incompleto, null e NaN nao sao seca", () => {
  const r = avaliarHistorico({
    linhas: [
      linha("2024-02-28", 0, 19),
      linha("2024-02-29", null),
      linha("2024-03-01", NaN),
    ],
    inicio: "2024-02-28",
    fim: "2024-03-01",
    gatilho: 1,
  });
  assert.equal(r.acionaria, false);
  assert.equal(r.diasIncompletos, 3);
});
test("rejeita datas inexistentes, gatilho invalido e duplicatas", () => {
  const base = {
    linhas: [],
    inicio: "2024-02-28",
    fim: "2024-03-01",
    gatilho: 10,
  };
  assert.throws(() => avaliarHistorico({ ...base, inicio: "2024-02-30" }));
  assert.throws(() => avaliarHistorico({ ...base, gatilho: 0 }));
  assert.throws(() =>
    avaliarHistorico({
      ...base,
      linhas: [linha("2024-02-28"), linha("2024-02-28")],
    }),
  );
});
