const path = require("node:path");
const fs = require("node:fs");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
} = require("hardhat/builtin-tasks/task-names");
const base = require("../../contratos/hardhat.config.js");
const raiz = path.resolve(__dirname, "../..");
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(
  async (args, hre, runSuper) => [
    ...(await runSuper(args)),
    ...fs
      .readdirSync(path.join(__dirname, "mocks"))
      .filter((f) => f.endsWith(".sol"))
      .map((f) => path.join(__dirname, "mocks", f)),
  ],
);
module.exports = {
  ...base,
  // Relatorio de gas por funcao (RNF07, HU01 criterio 4, HU03).
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "BRL",
    outputFile: process.env.GAS_OUTPUT_FILE || undefined,
    noColors: Boolean(process.env.GAS_OUTPUT_FILE),
  },

  mocha: { timeout: 120000 },
  typechain: { outDir: path.join(raiz, "testes/gerados/contratos/typechain") },
  paths: {
    root: raiz,
    sources: path.join(raiz, "contratos/contracts"),
    tests: path.join(__dirname, "unitarios"),
    artifacts: path.join(raiz, "testes/gerados/contratos/artifacts"),
    cache: path.join(raiz, "testes/gerados/contratos/cache"),
  },
};
