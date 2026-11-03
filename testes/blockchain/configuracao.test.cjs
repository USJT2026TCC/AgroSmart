const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const carregar = createRequire(path.join(root, "blockchain/package.json"));
const cli = carregar.resolve("hardhat/internal/cli/cli.js");
function ambiente(extra = {}) {
  return {
    ...process.env,
    RPC_SEPOLIA: "http://127.0.0.1:9",
    CHAVE_PRIVADA_SEGURADORA: "0x" + "11".repeat(32),
    CHAVE_PRIVADA_ORACULO: "0x" + "22".repeat(32),
    PRECO_GAS_GWEI: "",
    ETHERSCAN_API_KEY: "",
    ...extra,
  };
}
test("preço de gás inválido é recusado antes de qualquer implantação", () => {
  for (const valor of ["NaN", "-1", "0", "Infinity", "0.00000000001"]) {
    const r = spawnSync(process.execPath, [cli, "help"], {
      cwd: path.join(root, "blockchain"),
      env: ambiente({ PRECO_GAS_GWEI: valor }),
      encoding: "utf8",
      timeout: 15000,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /PRECO_GAS_GWEI/);
  }
});
test("Hardhat disponibiliza somente a seguradora como signatária da implantação", () => {
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `const hre=require('hardhat'); console.log(JSON.stringify(hre.config.networks.sepolia.accounts));`,
    ],
    {
      cwd: path.join(root, "blockchain"),
      env: ambiente(),
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(r.status, 0, r.stderr);
  const contas = JSON.parse(r.stdout.trim());
  assert.equal(contas.length, 1);
  assert.equal(contas[0], "0x" + "11".repeat(32));
});
