import path from "node:path";
import { existsSync } from "node:fs";
import { executar, raiz } from "../scripts/processos.mjs";

function npm(modulo, argumentos) {
  if (!process.env.npm_execpath)
    throw new Error("Execute este comando por npm na raiz do projeto.");
  return executar(process.execPath, [process.env.npm_execpath, ...argumentos], {
    cwd: path.join(raiz, modulo),
  });
}

// Sequencial: cobertura e Slither recompilam os mesmos artefatos usados nas integracoes.
try {
  await executar(
    process.execPath,
    ["--test", "testes/infraestrutura/banco.test.mjs"],
    { cwd: raiz },
  );
  console.log("1/8 Contratos e cobertura");
  await npm("blockchain", [
    "exec",
    "--",
    "hardhat",
    "--config",
    "../testes/blockchain/hardhat.config.cjs",
    "clean",
  ]);
  await npm("blockchain", [
    "exec",
    "--",
    "hardhat",
    "--config",
    "../testes/blockchain/hardhat.config.cjs",
    "coverage",
    "--solcoverjs",
    "testes/configuracao/solcover.cjs",
  ]);
  console.log("2/8 Analise estatica dos contratos");
  await executar(
    process.platform === "win32" ? "slither.exe" : "slither",
    [".", "--config-file", "../testes/configuracao/slither.json"],
    { cwd: path.join(raiz, "blockchain") },
  );
  console.log("3/8 API e cobertura");
  await npm("api", ["run", "cobertura"]);
  console.log("4/8 Integracao API e blockchain local");
  await npm("api", ["run", "testar:integracao"]);
  console.log("5/8 Oraculo, integracao e cobertura");
  await npm("oraculo", ["run", "cobertura"]);
  console.log("6/8 Telas e cobertura");
  await npm("interface", ["run", "cobertura"]);
  console.log("7/8 Geracao do aplicativo");
  await npm("interface", ["run", "build"]);
  await executar(
    process.execPath,
    ["--test", "testes/infraestrutura/interface.test.mjs"],
    { cwd: raiz },
  );
  console.log("8/8 ETL");
  const python = path.join(
    raiz,
    "etl",
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  if (!existsSync(python))
    throw new Error(
      "Prepare o ambiente etl/.venv com as dependencias dev antes da verificacao.",
    );
  await executar(
    python,
    [
      "-m",
      "pytest",
      "../testes/etl",
      "-c",
      "../testes/configuracao/pytest.ini",
      "--basetemp",
      "../testes/gerados/etl/temporarios",
      "--cov=etl",
      "--cov-report=term",
      "--cov-config=../testes/configuracao/coverage.ini",
      "--cov-fail-under=70",
      "-q",
    ],
    {
      cwd: path.join(raiz, "etl"),
    },
  );
  console.log(
    "Verificacao automatizada concluida. MetaMask e Sepolia exigem verificacao propria.",
  );
} catch (erro) {
  console.error(`Verificacao interrompida: ${erro.message}`);
  process.exitCode = 1;
}
