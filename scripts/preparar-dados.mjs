/** Reconstrucao opcional: ETL Python e atualizacao do pacote que a API importa. */
import { existsSync } from "node:fs";
import path from "node:path";
import { executar, raiz } from "./processos.mjs";
import limites from "../configuracao/historico.json" with { type: "json" };

try {
  if (process.argv.length > 2)
    throw new Error("Use npm run dados:preparar, sem argumentos adicionais.");
  const python = path.join(
    raiz,
    "etl/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  if (!existsSync(python))
    throw new Error(
      "Ambiente Python ausente. Crie etl/.venv e instale o pacote etl conforme o README do ETL.",
    );
  console.log(
    `INMET ${limites.estacao}: ${limites.inicio} a ${limites.fim}. ZIPs anuais ficam em cache; nenhum dado e enviado ao contrato.`,
  );
  await executar(python, ["-u", "-m", "etl", "preparar"], {
    cwd: path.join(raiz, "etl"),
    env: { ...process.env, PYTHONPATH: path.join(raiz, "etl/src") },
  });
  await executar(process.execPath, [path.join(raiz, "scripts/empacotar-dados.mjs")], { cwd: raiz });
  console.log(
    "Pacote preparado. Execute npm start para reconstruir a imagem e importar as alteracoes pela API.",
  );
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
