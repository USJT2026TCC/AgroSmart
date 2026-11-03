import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { executar, raiz } from "../../scripts/processos.mjs";
import { conferirContainers, conferirSaude, verificarRede } from "../../scripts/iniciar.mjs";
import { empacotarDados } from "../../scripts/empacotar-dados.mjs";
const { Interface } = createRequire(path.join(raiz, "blockchain/package.json"))("ethers");
const m = JSON.parse(readFileSync(path.join(raiz, "blockchain/implantacoes/sepolia.json")));
const saude = () => ({
  situacao: "ok",
  banco: { motor: "postgres" },
  cadeia: { contratosImplantados: true, fabrica: m.contratos.ApoliceFactory },
  indexador: { ativo: true, ultimoErro: null },
});
test("status recusa indexador ativo com erro, banco divergente ou fabrica desatualizada", () => {
  assert.doesNotThrow(() => conferirSaude(saude(), m));
  for (const alterar of [
    (s) => {
      s.indexador.ultimoErro = { mensagem: "RPC indisponivel" };
    },
    (s) => {
      s.indexador.ativo = false;
    },
    (s) => {
      s.banco.motor = "outro";
    },
    (s) => {
      s.cadeia.fabrica = "0x1";
    },
    (s) => {
      s.cadeia.contratosImplantados = false;
    },
  ]) {
    const s = saude();
    alterar(s);
    assert.throws(() => conferirSaude(s, m), /Integracao incompleta/);
  }
});
test("comandos com argumentos extras falham antes de iniciar servicos ou baixar dados", () => {
  for (const [nome, args] of [
    ["iniciar.mjs", ["status", "extra"]],
    ["preparar-dados.mjs", ["extra"]],
    ["empacotar-dados.mjs", ["extra"]],
  ]) {
    const r = spawnSync(process.execPath, [path.join(raiz, "scripts", nome), ...args], {
      cwd: raiz,
      encoding: "utf8",
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /argumentos adicionais/);
  }
});
test("empacotador confere os 15 arquivos antes de substituir qualquer dado publico", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "agrosmart-pacote-"));
  const origem = path.join(pasta, "origem"),
    destino = path.join(pasta, "destino");
  try {
    cpSync(path.join(raiz, "api/recursos/inmet/A770"), origem, { recursive: true });
    assert.deepEqual(empacotarDados(origem, destino), { anos: 5, arquivos: 15 });
    const diario = readFileSync(path.join(destino, "2024-diario.csv"));
    writeFileSync(path.join(origem, "2024-diario.csv"), "alterado");
    assert.throws(() => empacotarDados(origem, destino), /Integridade divergente/);
    assert.deepEqual(readFileSync(path.join(destino, "2024-diario.csv")), diario);
    const manifesto = JSON.parse(readFileSync(path.join(origem, "manifesto.json")));
    manifesto.anos[2019] = {};
    writeFileSync(path.join(origem, "manifesto.json"), JSON.stringify(manifesto));
    assert.throws(() => empacotarDados(origem, destino), /somente os anos/);
  } finally {
    assert.equal(path.dirname(pasta), tmpdir());
    assert.ok(path.basename(pasta).startsWith("agrosmart-pacote-"));
    rmSync(pasta, { recursive: true, force: true });
  }
});
test("consulta RPC confere rede, registro, seguradora e autorizacao sem enviar transacoes", async () => {
  const abi = new Interface([
    "function registry() view returns (address)",
    "function seguradora() view returns (address)",
    "function ehAutorizado(address) view returns (bool)",
  ]);
  let autorizado = true,
    chainId = "0xaa36a7",
    dona = m.seguradora;
  const metodos = [];
  const servidor = http
    .createServer((pedido, resposta) => {
      let corpo = "";
      pedido.on("data", (b) => {
        corpo += b;
      });
      pedido.on("end", () => {
        const r = JSON.parse(corpo);
        metodos.push(r.method);
        let result;
        if (r.method === "eth_chainId") result = chainId;
        else if (r.method === "eth_getCode") result = "0x6000";
        else if (r.method === "eth_call") {
          const f = abi.getFunction(r.params[0].data.slice(0, 10));
          const valor =
            f.name === "registry"
              ? m.contratos.OracleRegistry
              : f.name === "seguradora"
                ? dona
                : autorizado;
          result = abi.encodeFunctionResult(f, [valor]);
        } else throw new Error("Metodo RPC nao esperado: " + r.method);
        resposta.writeHead(200, { "Content-Type": "application/json" });
        resposta.end(JSON.stringify({ jsonrpc: "2.0", id: r.id, result }));
      });
    })
    .listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const env = { RPC_SEPOLIA: `http://127.0.0.1:${servidor.address().port}` };
  try {
    await verificarRede(env, m);
    autorizado = false;
    await assert.rejects(() => verificarRede(env, m), /integracao Sepolia/);
    autorizado = true;
    dona = "0x0000000000000000000000000000000000000001";
    await assert.rejects(() => verificarRede(env, m), /integracao Sepolia/);
    dona = m.seguradora;
    chainId = "0x1";
    await assert.rejects(() => verificarRede(env, m), /integracao Sepolia/);
    assert.ok(metodos.every((v) => ["eth_chainId", "eth_getCode", "eth_call"].includes(v)));
  } finally {
    await new Promise((r) => {
      servidor.close(r);
      servidor.closeAllConnections();
    });
  }
});

test("status exige os quatro servicos e nao oculta oraculo parado", () => {
  const lista = ["banco", "api", "oraculo", "interface"].map((Service) => ({
    Service,
    State: "running",
    Health: Service === "oraculo" ? "" : "healthy",
  }));
  assert.doesNotThrow(() => conferirContainers(lista));
  assert.throws(() => conferirContainers(lista.filter((c) => c.Service !== "oraculo")), /oraculo/);
  assert.throws(
    () =>
      conferirContainers(
        lista.map((c) => (c.Service === "oraculo" ? { ...c, State: "exited" } : c)),
      ),
    /oraculo/,
  );
  assert.throws(
    () =>
      conferirContainers(
        lista.map((c) => (c.Service === "banco" ? { ...c, Health: "unhealthy" } : c)),
      ),
    /banco/,
  );
});
test("executor captura saida completa e propaga falha do processo", async () => {
  assert.equal(
    await executar(process.execPath, ["-e", "process.stdout.write('saida-completa')"], {
      capturar: true,
    }),
    "saida-completa",
  );
  await assert.rejects(
    () => executar(process.execPath, ["-e", "process.exit(7)"], { capturar: true }),
    /terminou com 7/,
  );
});
