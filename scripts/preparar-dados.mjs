import { spawn } from "node:child_process";
import { executar } from "./processos.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const raiz = fileURLToPath(new URL("../", import.meta.url));
const python = path.join(
  raiz,
  "etl/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
console.log(
  "INMET: ZIPs anuais 2020–setembro/2026 (tamanho total depende da fonte). Somente A770 e preservada nos CSVs preparados. Nao ha envio ao contrato.",
);
const filho = spawn(python, ["-u", "-m", "etl", "preparar", ...process.argv.slice(2)], {
  cwd: path.join(raiz, "etl"),
  env: { ...process.env, PYTHONPATH: path.join(raiz, "etl/src") },
  stdio: "inherit",
  windowsHide: true,
});
filho.on("error", (erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
filho.on("exit", async (codigo) => {
  process.exitCode = codigo ?? 1;
  if (codigo !== 0 || process.argv.slice(2).some((a) => ["--help", "-h"].includes(a))) return;
  try {
    await executar(process.execPath, [path.join(raiz, "scripts/empacotar-dados.mjs")], {
      cwd: raiz,
    });
    console.log(
      "Preparo e pacote concluidos. Na proxima inicializacao da API, a carga no PostgreSQL sera automatica.",
    );
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
});
