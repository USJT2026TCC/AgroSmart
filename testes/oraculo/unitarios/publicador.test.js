"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { Wallet } = require("ethers");
const { Publicador, TENTATIVAS_LIMITE_DE_TAXA } = require("../../../oraculo/src/publicador");
function publicador({ rede = 31337, bloco = 101, recibo, confirmacoes = 2 } = {}) {
  const p = Object.create(Publicador.prototype);
  p.chainIdEsperado = 31337;
  p.confirmacoes = confirmacoes;
  p.signatario = { address: "0x1234" };
  p.provider = {
    send: async (metodo) =>
      metodo === "eth_chainId" ? "0x" + rede.toString(16) : "0x" + bloco.toString(16),
    getTransactionReceipt: async () => recibo,
  };
  return p;
}
const tx = {
  txHash: "0x" + "a".repeat(64),
  enviadoEm: "2024-01-01T00:00:00Z",
};
const recibo = {
  hash: tx.txHash,
  blockNumber: 100,
  status: 1,
  logs: [],
  gasUsed: 21000n,
  gasPrice: 1n,
};
test("retomada usa altura RPC atual sem depender do cache de blocos", async () => {
  const r = await publicador({ recibo }).recuperar(tx);
  assert.equal(r.txHash, tx.txHash);
  assert.equal(r.recuperada, true);
  assert.equal(r.gasUsado, 21000n);
});
test("recibo ainda ausente nao gera novo envio", async () => {
  await assert.rejects(() => publicador().recuperar(tx), /nenhum reenvio/);
});
test("confirmacoes insuficientes mantem a transacao aguardando", async () => {
  await assert.rejects(() => publicador({ recibo, bloco: 100 }).recuperar(tx), /confirmacoes/);
});
test("transacao revertida e falha definitiva", async () => {
  await assert.rejects(
    () => publicador({ recibo: { ...recibo, status: 0 } }).recuperar(tx),
    (e) => e.definitivo === true,
  );
});
test("RPC de outra rede bloqueia publicacao e retomada", async () => {
  await assert.rejects(() => publicador({ rede: 1, recibo }).recuperar(tx), /rede incompativel/);
});

/** RPC local que responde 429 nas primeiras `recusas` chamadas e depois atende. */
async function rpcComLimite(recusas) {
  let pedidos = 0;
  const servidor = http.createServer((pedido, resposta) => {
    let corpo = "";
    pedido.on("data", (b) => (corpo += b));
    pedido.on("end", () => {
      pedidos += 1;
      if (pedidos <= recusas) {
        resposta.writeHead(429).end("Too Many Requests");
        return;
      }
      const { id } = JSON.parse(corpo);
      resposta.writeHead(200, { "Content-Type": "application/json" });
      resposta.end(JSON.stringify({ jsonrpc: "2.0", id, result: "0x64" }));
    });
  });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    pedidos: () => pedidos,
    fechar: () => new Promise((r) => servidor.close(r)),
  };
}
test("limite de taxa do RPC e repetido com espera, sem abandonar a chamada", async () => {
  const rpc = await rpcComLimite(2);
  const p = new Publicador({
    rpcUrl: rpc.url,
    chavePrivada: Wallet.createRandom().privateKey,
    chainId: 31337,
  });
  try {
    assert.equal(await p.provider.getBlockNumber(), 100);
    assert.equal(rpc.pedidos(), 3);
  } finally {
    p.provider.destroy();
    await rpc.fechar();
  }
});
test("limite de taxa persistente falha depois de poucas tentativas", async () => {
  const rpc = await rpcComLimite(Infinity);
  const p = new Publicador({
    rpcUrl: rpc.url,
    chavePrivada: Wallet.createRandom().privateKey,
    chainId: 31337,
    timeoutMs: 3000,
  });
  try {
    await assert.rejects(() => p.provider.getBlockNumber());
    assert.ok(rpc.pedidos() <= TENTATIVAS_LIMITE_DE_TAXA + 1);
  } finally {
    p.provider.destroy();
    await rpc.fechar();
  }
});
