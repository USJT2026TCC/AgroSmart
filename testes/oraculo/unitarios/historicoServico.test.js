"use strict";
const { criarTemporario, limparTemporario } = require("../fixtures/temporario.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { ServicoOraculo } = require("../../../oraculo/src/oraculo");
const { FilaDePublicacoes } = require("../../../oraculo/src/fila");
const { RegistroDePublicacoes } = require("../../../oraculo/src/registro");
const { executarCiclo } = require("../../../oraculo/src/ciclo");
const { pacote, compromisso } = require("../fixtures/historico.cjs");
const { avaliarHistorico } = require("../../../oraculo/src/historico");
const RECIBO = {
  txHash: "0x" + "ab".repeat(32),
  bloco: 7,
  gasEstimado: "21000",
  gasUsado: 21000n,
  custoWei: 1n,
  enviadoEm: "2024-01-01T00:00:00Z",
  confirmadoEm: "2024-01-01T00:00:01Z",
  acionouPagamento: true,
  oraculo: "0x1234",
};
function caso(
  t,
  linhas = [
    { data: "2024-02-07", chuva_mm: 0, horas_validas: 24 },
    { data: "2024-02-08", chuva_mm: 0, horas_validas: 24 },
    { data: "2024-02-09", chuva_mm: 10, horas_validas: 24 },
  ],
) {
  const dir = criarTemporario("agrosmart-historico-");
  t.after(() => limparTemporario(dir));
  const dirPacote = path.join(dir, "pacote"),
    meta = pacote(dirPacote, linhas);
  const termos = {
    modoHistorico: true,
    estacao: "A770",
    inicioHistorico: "2024-02-07",
    fimHistorico: "2024-02-09",
    limiarClimatico: 2,
    hashSerie: meta.hashSerie,
  };
  const resposta = { termos, linhas: structuredClone(linhas), ...compromisso(termos) };
  const cadeia = {
    vigenciaInicio: 1707264000n,
    vigenciaFim: 1707523199n,
    limiarClimatico: 2n,
    modoPagamento: 0,
    limiarClimaticoIntegral: 0,
    hashTermos: resposta.hashTermos,
  };
  let envios = 0;
  const publicador = {
    termosHistoricos: async () => cadeia,
    periodoJaPublicado: async () => false,
    publicar: async ({ aoTransmitir }) => {
      envios++;
      await aoTransmitir?.({
        txHash: RECIBO.txHash,
        gasEstimado: "21000",
        enviadoEm: RECIBO.enviadoEm,
      });
      return RECIBO;
    },
  };
  const backend = {
    serieHistorica: async () => resposta,
    relatarPublicacao: async () => {},
    relatarFalha: async () => {},
  };
  const nova = () =>
    new ServicoOraculo({
      publicador,
      backend,
      fila: new FilaDePublicacoes(path.join(dir, "fila.json")),
      registro: new RegistroDePublicacoes(path.join(dir, "registro.jsonl")),
      opcoes: { dirPacote, esperaBaseMs: 1, somenteHistorico: true },
    });
  return { resposta, cadeia, dirPacote, publicador, backend, nova, envios: () => envios };
}
test("historico valida compromisso e seleciona primeiro acionamento", async (t) => {
  const c = caso(t),
    s = c.nova();
  const e = await s.prepararHistorico("0xa");
  assert.equal(e.periodo, 20240208);
  assert.equal(e.payload.indiceClimatico, 2);
  assert.equal(s.fila.entradas.length, 1);
});
test("sem acionamento publica ultimo dia com indice correspondente", async (t) => {
  const c = caso(t);
  c.resposta.termos.limiarClimatico = 4;
  c.cadeia.limiarClimatico = 4;
  Object.assign(c.resposta, compromisso(c.resposta.termos));
  c.cadeia.hashTermos = c.resposta.hashTermos;
  const e = await c.nova().prepararHistorico("0xa");
  assert.equal(e.periodo, 20240209);
  assert.equal(e.payload.indiceClimatico, 0);
});
for (const campo of ["hashTermos", "descricaoDosTermos"])
  test(`bloqueia ${campo} alterado`, async (t) => {
    const c = caso(t);
    c.resposta[campo] += "x";
    await assert.rejects(() => c.nova().prepararHistorico("0xa"));
  });
test("bloqueia parametros do banco divergentes dos termos assinados", async (t) => {
  const c = caso(t);
  c.resposta.termos.hashSerie = "a".repeat(64);
  await assert.rejects(() => c.nova().prepararHistorico("0xa"), /texto assinado/);
});
test("bloqueia gatilho diferente na cadeia", async (t) => {
  const c = caso(t);
  c.cadeia.limiarClimatico = 3;
  await assert.rejects(() => c.nova().prepararHistorico("0xa"), /divergentes/);
});
test("bloqueia fonte diferente de A770", async (t) => {
  const c = caso(t);
  c.resposta.termos.estacao = "A747";
  await assert.rejects(() => c.nova().prepararHistorico("0xa"), /Fonte/);
});
test("alterar chuva no banco sem alterar metadados nao passa", async (t) => {
  const c = caso(t);
  c.resposta.linhas[0].chuva_mm = 9;
  await assert.rejects(() => c.nova().prepararHistorico("0xa"), /difere do pacote/);
});
test("alterar pacote local nao passa nos hashes", async (t) => {
  const c = caso(t);
  fs.appendFileSync(path.join(c.dirPacote, "2024-diario.csv"), "alterado");
  await assert.rejects(() => c.nova().prepararHistorico("0xa"), /Integridade/);
});
test("serie com dia incompleto nao e publicada", async (t) => {
  const c = caso(t, [
    { data: "2024-02-07", chuva_mm: 0, horas_validas: 19 },
    { data: "2024-02-08", chuva_mm: 0, horas_validas: 24 },
    { data: "2024-02-09", chuva_mm: 0, horas_validas: 24 },
  ]);
  await assert.rejects(() => c.nova().prepararHistorico("0xa"), /incompletos/);
});
test("periodo ja publicado nao cria entrada pendente", async (t) => {
  const c = caso(t);
  c.publicador.periodoJaPublicado = async () => true;
  const s = c.nova();
  assert.equal((await s.prepararHistorico("0xa")).estado, "ja-publicada");
  assert.equal(s.fila.entradas.length, 0);
});
test("retoma hash transmitido apos reinicio sem segundo envio", async (t) => {
  const c = caso(t);
  const primeiro = c.publicador.publicar;
  c.publicador.publicar = async (dados) => {
    await primeiro(dados);
    throw new Error("timeout apos envio");
  };
  let s = c.nova();
  const e = await s.prepararHistorico("0xa");
  assert.equal((await s.publicarEntrada(e)).sucesso, false);
  s = c.nova();
  c.publicador.recuperar = async (tx) => {
    assert.equal(tx.txHash, RECIBO.txHash);
    return RECIBO;
  };
  const r = await s.drenarFila();
  assert.equal(r.publicadas, 1);
  assert.equal(c.envios(), 1);
  assert.equal(s.fila.entradas[0].estado, "concluida");
});
test("falha de registro depois da confirmacao nao provoca reenvio", async (t) => {
  const c = caso(t),
    s = c.nova();
  const original = s.registro.registrar.bind(s.registro);
  s.registro.registrar = () => {
    throw new Error("disco temporariamente indisponivel");
  };
  const e = await s.prepararHistorico("0xa");
  assert.equal((await s.publicarEntrada(e)).sucesso, true);
  assert.equal(e.estado, "concluida");
  assert.equal(e.auditoriaPendente, true);
  s.registro.registrar = original;
  await s.drenarFila();
  assert.equal(e.auditoriaPendente, false);
  assert.equal(c.envios(), 1);
  assert.equal(s.registro.listar().length, 1);
});
test("relato indisponivel e tentado novamente sem duplicar registro ou envio", async (t) => {
  const c = caso(t),
    s = c.nova();
  c.backend.relatarPublicacao = async () => {
    throw new Error("API indisponivel");
  };
  const e = await s.prepararHistorico("0xa");
  await s.publicarEntrada(e);
  assert.equal(e.auditoriaPendente, true);
  c.backend.relatarPublicacao = async () => {};
  await s.drenarFila();
  assert.equal(e.auditoriaPendente, false);
  assert.equal(s.registro.listar().length, 1);
  assert.equal(c.envios(), 1);
});
test("servico historico bloqueia entradas antigas de sensores", async (t) => {
  const c = caso(t),
    s = c.nova();
  const e = s.fila.enfileirar({
    apolice: "0xa",
    periodo: 20240207,
    payload: { indiceClimatico: 1, procedencia: { fontesUsadas: ["a", "b"] } },
  }).entrada;
  assert.equal((await s.publicarEntrada(e)).sucesso, false);
  assert.equal(e.estado, "falha");
  assert.equal(c.envios(), 0);
});
test("ciclo retoma fila mesmo com API indisponivel", async () => {
  let drenada = 0;
  await executarCiclo(
    {
      backend: {
        apolicesAtivas: async () => {
          throw new Error("offline");
        },
      },
      drenarFila: async () => {
        drenada++;
      },
    },
    () => {},
  );
  assert.equal(drenada, 1);
});
test("ciclo ignora apolice convencional e calcula apenas historica", async () => {
  const preparadas = [];
  await executarCiclo(
    {
      backend: {
        apolicesAtivas: async () => [
          { endereco: "antiga", termos: {} },
          { endereco: "historica", termos: { modoHistorico: true } },
        ],
      },
      prepararHistorico: async (a) => {
        preparadas.push(a);
        return { periodo: 20240207, estado: "pendente" };
      },
      drenarFila: async () => {},
    },
    () => {},
  );
  assert.deepEqual(preparadas, ["historica"]);
});
test("chuva vazia, booleana e horas fracionarias nao contam como dias secos", () => {
  const base = { inicio: "2024-02-07", fim: "2024-02-07", gatilho: 1 };
  for (const l of [
    { chuva_mm: "", horas_validas: 24 },
    { chuva_mm: false, horas_validas: 24 },
    { chuva_mm: 0, horas_validas: 20.5 },
    { chuva_mm: 13000, horas_validas: 24 },
  ]) {
    const r = avaliarHistorico({ ...base, linhas: [{ data: "2024-02-07", ...l }] });
    assert.equal(r.acionaria, false);
    assert.equal(r.diasIncompletos, 1);
  }
});

test("linha de comando recusa opcoes antigas e intervalo invalido sem acessar cadeia", () => {
  const { spawnSync } = require("node:child_process");
  const arquivo = path.resolve(__dirname, "../../../oraculo/src/index.js");
  for (const args of [
    ["servico", "--periodo", "20240101"],
    ["servico", "--intervalo", "NaN"],
    ["servico", "--cenario", "seca"],
  ]) {
    const r = spawnSync(process.execPath, [arquivo, ...args], {
      encoding: "utf8",
      env: { ...process.env, ARQUIVO_ENV: "arquivo-inexistente", CHAVE_PRIVADA_ORACULO: "" },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /Opcao|Intervalo/);
  }
});
