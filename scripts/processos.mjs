import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const raiz = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function executar(comando, argumentos, opcoes = {}) {
  return new Promise((resolve, reject) => {
    // A sessao atual pode ter PATH anterior a instalacao do Docker Desktop.
    if (comando === "docker" && process.platform === "win32") {
      const candidatos = [
        path.join(
          process.env.LOCALAPPDATA || "",
          "Programs",
          "DockerDesktop",
          "resources",
          "bin",
          "docker.exe",
        ),
        path.join(
          process.env.ProgramFiles || "C:/Program Files",
          "Docker",
          "Docker",
          "resources",
          "bin",
          "docker.exe",
        ),
      ];
      const instalado = candidatos.find(existsSync);
      if (instalado) {
        comando = instalado;
        const ambiente = opcoes.env || process.env;
        opcoes = {
          ...opcoes,
          env: {
            ...ambiente,
            PATH:
              path.dirname(instalado) + path.delimiter + (ambiente.PATH || ""),
          },
        };
      }
    }
    const filho = spawn(comando, argumentos, {
      windowsHide: true,
      stdio: "inherit",
      ...opcoes,
    });
    filho.once("error", reject);
    filho.once("exit", (codigo, sinal) =>
      codigo === 0
        ? resolve()
        : reject(
            new Error(
              `${path.basename(comando)} terminou com ${codigo ?? sinal}`,
            ),
          ),
    );
  });
}
