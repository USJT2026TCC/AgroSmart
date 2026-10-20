import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { executar, raiz } from "./processos.mjs";
const requireBackend = createRequire(path.join(raiz, "backend/package.json"));

export function ambienteDoBanco() {
  const arquivo = path.join(raiz, "backend/.env");
  const local = existsSync(arquivo)
    ? requireBackend("dotenv").parse(readFileSync(arquivo))
    : {};
  return { ...local, ...process.env };
}
export function configuracaoDoBanco(ambiente) {
  if (ambiente.DATABASE_URL)
    return { url: ambiente.DATABASE_URL, docker: false, ambiente };
  const porta = Number(ambiente.POSTGRES_PORT || 5433);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535)
    throw new Error("POSTGRES_PORT invalida.");
  const usuario = ambiente.POSTGRES_USER || "agrosmart";
  const senha = ambiente.POSTGRES_PASSWORD || "agrosmart_dev";
  const banco = ambiente.POSTGRES_DB || "agrosmart";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(banco))
    throw new Error("POSTGRES_DB invalido.");
  return {
    url: `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(senha)}@127.0.0.1:${porta}/${banco}`,
    docker: true,
    ambiente: {
      ...ambiente,
      POSTGRES_USER: usuario,
      POSTGRES_PASSWORD: senha,
      POSTGRES_DB: banco,
      POSTGRES_PORT: String(porta),
    },
  };
}
export async function iniciarBanco(config, rodar = executar) {
  if (!config.docker) return;
  try {
    await rodar("docker", ["compose", "version"], {
      cwd: raiz,
      env: config.ambiente,
    });
    await rodar(
      "docker",
      [
        "compose",
        "--file",
        path.join(raiz, "docker-compose.yml"),
        "up",
        "--detach",
        "--wait",
        "--wait-timeout",
        "120",
        "banco",
      ],
      { cwd: raiz, env: config.ambiente },
    );
  } catch (erro) {
    throw new Error(
      erro.code === "ENOENT"
        ? "Docker nao encontrado. Instale e abra o Docker Desktop com Compose antes de iniciar. O banco PGlite anterior permanece preservado."
        : "Nao foi possivel iniciar o PostgreSQL no Docker. Confira Docker Desktop, porta e a mensagem acima. Nenhum volume foi apagado.",
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const config = configuracaoDoBanco(ambienteDoBanco());
    if (process.argv[2] === "parar") {
      if (!config.docker)
        throw new Error(
          "DATABASE_URL aponta para banco externo; ele nao e gerenciado pelo Compose.",
        );
      await executar(
        "docker",
        [
          "compose",
          "--file",
          path.join(raiz, "docker-compose.yml"),
          "stop",
          "banco",
        ],
        { cwd: raiz, env: config.ambiente },
      );
    } else await iniciarBanco(config);
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}
