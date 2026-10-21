"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { Publicador } = require("../../../oraculo/src/publicador");
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
  gasEstimado: "21000",
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
  const r = await publicador({ recibo }).recuperar(tx, "0x1234");
  assert.equal(r.txHash, tx.txHash);
  assert.equal(r.recuperada, true);
  assert.equal(r.custoWei, 21000n);
});
test("recibo ainda ausente nao gera novo envio", async () => {
  await assert.rejects(() => publicador().recuperar(tx, "0x1234"), /nenhum reenvio/);
});
test("confirmacoes insuficientes mantem a transacao aguardando", async () => {
  await assert.rejects(
    () => publicador({ recibo, bloco: 100 }).recuperar(tx, "0x1234"),
    /confirmacoes/,
  );
});
test("transacao revertida e falha definitiva", async () => {
  await assert.rejects(
    () => publicador({ recibo: { ...recibo, status: 0 } }).recuperar(tx, "0x1234"),
    (e) => e.definitivo === true,
  );
});
test("RPC de outra rede bloqueia publicacao e retomada", async () => {
  await assert.rejects(
    () => publicador({ rede: 1, recibo }).recuperar(tx, "0x1234"),
    /rede incompativel/,
  );
});
