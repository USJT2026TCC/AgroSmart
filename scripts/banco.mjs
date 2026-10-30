import path from "node:path";
import { executar, raiz } from "./processos.mjs";

/** Usuario, senha, banco e porta do PostgreSQL do Compose; padroes da demonstracao. */
export function configuracaoDoBanco(ambiente) {
  const porta = Number(ambiente.POSTGRES_PORT || 5433);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535)
    throw new Error("POSTGRES_PORT invalida.");
  const usuario = ambiente.POSTGRES_USER || "agrosmart";
  const senha = ambiente.POSTGRES_PASSWORD || "agrosmart_dev";
  const banco = ambiente.POSTGRES_DB || "agrosmart";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(banco)) throw new Error("POSTGRES_DB invalido.");
  const url = `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(senha)}@127.0.0.1:${porta}/${banco}`;
  return {
    url,
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
        ? "Docker nao encontrado. Instale e abra o Docker Desktop com Compose antes de iniciar."
        : "Nao foi possivel iniciar o PostgreSQL no Docker. Confira Docker Desktop, porta e a mensagem acima. Nenhum volume foi apagado.",
    );
  }
}
