import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function executar(comando, argumentos, { capturar = false, ...opcoes } = {}) {
  return new Promise((resolve, reject) => {
    // Localiza o Docker Desktop no Windows mesmo quando ele nao consta do PATH.
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
            PATH: path.dirname(instalado) + path.delimiter + (ambiente.PATH || ""),
          },
        };
      }
    }
    const filho = spawn(comando, argumentos, {
      windowsHide: true,
      stdio: capturar ? ["ignore", "pipe", "inherit"] : "inherit",
      ...opcoes,
    });
    let saida = "";
    if (capturar)
      filho.stdout.on("data", (parte) => {
        saida += parte;
      });
    filho.once("error", reject);
    filho.once("close", (codigo, sinal) =>
      codigo === 0
        ? resolve(capturar ? saida : undefined)
        : reject(new Error(`${path.basename(comando)} terminou com ${codigo ?? sinal}`)),
    );
  });
}
