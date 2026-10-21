"use strict";
const { criarTemporario } = require("../fixtures/temporario.cjs");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { ClienteBackend } = require("../../../oraculo/src/clienteBackend.js");
const { ServicoOraculo } = require("../../../oraculo/src/oraculo.js");
const { FilaDePublicacoes, ESTADOS } = require("../../../oraculo/src/fila.js");
const { RegistroDePublicacoes } = require("../../../oraculo/src/registro.js");
const { RegistroReputacao } = require("../../../oraculo/src/reputacao.js");

/**
 * Integracao do oraculo com o backend.
 *
 * O cliente e testado contra um servidor HTTP de verdade, local, que imita a API.
 * O servico e testado com publicador e backend falsos, para verificar o que ele
 * relata e quando — sem blockchain e sem backend rodando.
 */

/** Sobe um servidor que responde conforme `rotas` e grava cada requisicao recebida. */
function servidorFalso(rotas) {
  const recebidas = [];

  const servidor = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (pedaco) => (corpo += pedaco));
    req.on("end", () => {
      recebidas.push({
        metodo: req.method,
        url: req.url,
        cabecalhos: req.headers,
        corpo: corpo ? JSON.parse(corpo) : null,
      });

      const rota = rotas[`${req.method} ${req.url.split("?")[0]}`];
      if (!rota) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            erro: { codigo: "nao_encontrado", mensagem: "rota" },
          }),
        );
        return;
      }

      const [status, resposta, atrasoMs = 0] = rota(req);
      setTimeout(() => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(resposta));
      }, atrasoMs);
    });
  });

  return new Promise((resolve) => {
    servidor.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${servidor.address().port}/api`,
        recebidas,
        fechar: () => new Promise((r) => servidor.close(r)),
      });
    });
  });
}

// ------------------------------------------------------------------ cliente

test("o cliente envia a chave de servico em toda requisicao", async () => {
  const s = await servidorFalso({
    "GET /api/oraculo/apolices-ativas": () => [200, { apolices: [] }],
  });

  try {
    await new ClienteBackend({ url: s.url, chave: "segredo" }).apolicesAtivas();
    assert.equal(s.recebidas[0].cabecalhos["x-chave-de-servico"], "segredo");
  } finally {
    await s.fechar();
  }
});

test("erro da API vira excecao com status e codigo", async () => {
  const s = await servidorFalso({
    "GET /api/oraculo/apolices-ativas": () => [
      401,
      { erro: { codigo: "nao_autenticado", mensagem: "Chave invalida." } },
    ],
  });

  try {
    await assert.rejects(
      new ClienteBackend({ url: s.url, chave: "errada" }).apolicesAtivas(),
      (erro) => {
        assert.equal(erro.status, 401);
        assert.equal(erro.codigo, "nao_autenticado");
        assert.equal(erro.message, "Chave invalida.");
        return true;
      },
    );
  } finally {
    await s.fechar();
  }
});

test("API lenta falha pelo tempo limite, sem pendurar o oraculo", async () => {
  const s = await servidorFalso({
    "GET /api/oraculo/apolices-ativas": () => [200, { apolices: [] }, 2_000],
  });

  try {
    const inicio = Date.now();
    await assert.rejects(
      new ClienteBackend({
        url: s.url,
        chave: "k",
        timeoutMs: 200,
      }).apolicesAtivas(),
    );
    assert.ok(Date.now() - inicio < 1_500);
  } finally {
    await s.fechar();
  }
});

test("BigInt no relato e serializado como texto", async () => {
  const s = await servidorFalso({
    "POST /api/oraculo/publicacoes": () => [201, { registrada: true }],
  });

  try {
    await new ClienteBackend({ url: s.url, chave: "k" }).relatarPublicacao({
      gasUsado: 231849n,
    });
    assert.equal(s.recebidas[0].corpo.gasUsado, "231849");
  } finally {
    await s.fechar();
  }
});

// ------------------------------------------------------------------ servico

function servicoComFalsos({ publicar, backend, maxTentativas = 2 }) {
  const dir = criarTemporario("agrosmart-oraculo-");

  return new ServicoOraculo({
    publicador: { publicar },
    fila: new FilaDePublicacoes(path.join(dir, "fila.json"), { maxTentativas }),
    registro: new RegistroDePublicacoes(path.join(dir, "publicacoes.jsonl")),
    reputacao: new RegistroReputacao(),
    backend,
    opcoes: { esperaBaseMs: 1, maxTentativas },
  });
}

function backendQueGrava({ falharRelato = false } = {}) {
  const relatos = { publicacoes: [], falhas: [] };

  return {
    relatos,
    async relatarPublicacao(d) {
      if (falharRelato) throw new Error("backend fora do ar");
      relatos.publicacoes.push(d);
    },
    async relatarFalha(d) {
      relatos.falhas.push(d);
    },
  };
}

const RECIBO = {
  txHash: "0x" + "ab".repeat(32),
  bloco: 7,
  gasEstimado: "240000",
  gasUsado: 231849n,
  custoWei: 1n,
  enviadoEm: "2026-10-06T12:00:00.000Z",
  confirmadoEm: "2026-10-06T12:00:00.180Z",
  acionouPagamento: true,
  oraculo: "0x3c44",
};

const leiturasSecas = ["estacao-a", "estacao-b"].flatMap((fonte) =>
  [0, 1, 2].map((i) => ({
    fonte,
    timestamp: `2026-10-0${4 + i}T12:00:00.000Z`,
    chuvaMm: 0,
  })),
);

test("publicacao bem-sucedida e relatada ao backend com gas, latencia e procedencia", async () => {
  const backend = backendQueGrava();
  const servico = servicoComFalsos({ publicar: async () => RECIBO, backend });

  servico.prepararPublicacao({
    apolice: "0xa",
    periodo: 20261006,
    leituras: leiturasSecas,
  });
  await servico.drenarFila();

  assert.equal(backend.relatos.publicacoes.length, 1);

  const relato = backend.relatos.publicacoes[0];
  assert.equal(relato.txHash, RECIBO.txHash);
  assert.equal(relato.periodo, 20261006);
  assert.equal(relato.indiceClimatico, 3);
  assert.deepEqual(relato.procedencia.fontesUsadas, ["estacao-a", "estacao-b"]);
});

test("backend fora do ar nao desfaz a publicacao ja feita na cadeia", async () => {
  const backend = backendQueGrava({ falharRelato: true });
  const servico = servicoComFalsos({ publicar: async () => RECIBO, backend });

  servico.prepararPublicacao({
    apolice: "0xa",
    periodo: 20261006,
    leituras: leiturasSecas,
  });
  const resultado = await servico.drenarFila();

  assert.equal(resultado.publicadas, 1);
  assert.equal(servico.fila.resumo().concluida, 1);
  // O registro local continua completo mesmo sem o backend.
  assert.equal(servico.registro.listar().length, 1);
});

test("so a falha definitiva e relatada, e uma unica vez", async () => {
  const backend = backendQueGrava();
  const servico = servicoComFalsos({
    publicar: async () => {
      throw new Error("ECONNREFUSED");
    },
    backend,
    maxTentativas: 3,
  });

  servico.prepararPublicacao({
    apolice: "0xa",
    periodo: 20261006,
    leituras: leiturasSecas,
  });
  await servico.drenarFila();

  assert.equal(servico.fila.entradas[0].estado, ESTADOS.FALHA);
  assert.equal(backend.relatos.falhas.length, 1);
  assert.equal(backend.relatos.falhas[0].tentativas, 3);
  assert.match(backend.relatos.falhas[0].motivo, /ECONNREFUSED/);
});

test("uma fonte climatica nao e suficiente para enfileirar publicacao", () => {
  const servico = servicoComFalsos({
    publicar: async () => RECIBO,
    backend: backendQueGrava(),
  });
  assert.throws(
    () =>
      servico.prepararPublicacao({
        apolice: "0xa",
        periodo: 20261006,
        leituras: leiturasSecas.filter((l) => l.fonte === "estacao-a"),
      }),
    /duas fontes climaticas/,
  );
  assert.equal(servico.fila.pendentes().length, 0);
});
