/**
 * RPC publico com limite de taxa: o indexador espera e repete a resposta 429, em
 * vez de abandonar o trecho e recomecar sempre do mesmo bloco.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import { config } from "../../../api/src/config.js";
import {
  TENTATIVAS_LIMITE_DE_TAXA,
  encerrarProvedor,
  provedor,
} from "../../../api/src/cadeia/rede.js";

async function rpcComLimite(recusas) {
  let pedidos = 0;
  const servidor = http.createServer((pedido, resposta) => {
    let corpo = "";
    pedido.on("data", (b) => (corpo += b));
    pedido.on("end", () => {
      pedidos += 1;
      if (pedidos <= recusas) return resposta.writeHead(429).end("Too Many Requests");
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

async function comRpc(rpc, executar) {
  const original = config.rpcUrl;
  config.rpcUrl = rpc.url;
  encerrarProvedor();
  try {
    return await executar(provedor());
  } finally {
    encerrarProvedor();
    config.rpcUrl = original;
    await rpc.fechar();
  }
}

test("resposta 429 e repetida com espera ate o RPC atender", async () => {
  const rpc = await rpcComLimite(2);
  await comRpc(rpc, async (p) => {
    assert.equal(await p.getBlockNumber(), 100);
    assert.equal(rpc.pedidos(), 3);
  });
});

test("429 persistente falha depois de poucas tentativas, sem repetir sem fim", async () => {
  const rpc = await rpcComLimite(Infinity);
  await comRpc(rpc, async (p) => {
    await assert.rejects(() => p.getBlockNumber());
    assert.ok(rpc.pedidos() <= TENTATIVAS_LIMITE_DE_TAXA + 1);
  });
});
