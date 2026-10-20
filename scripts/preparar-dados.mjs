import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const raiz = fileURLToPath(new URL("../", import.meta.url));
const python = path.join(
  raiz,
  "simulador/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
console.log(
  "INMET: ZIPs anuais 2020–setembro/2026 (tamanho total depende da fonte). Somente A770 e preservada nos CSVs preparados. Nao ha envio ao contrato.",
);
const filho = spawn(
  python,
  ["-u", "-m", "simulador", "preparar", ...process.argv.slice(2)],
  { cwd: path.join(raiz, "simulador"), stdio: "inherit", windowsHide: true },
);
filho.on("error", (erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
filho.on("exit", (codigo) => {
  process.exitCode = codigo ?? 1;
  if (codigo === 0)
    console.log(
      "Preparacao concluida. Execute npm run dados:empacotar para atualizar o pacote publico; depois reinicie a API.",
    );
});
