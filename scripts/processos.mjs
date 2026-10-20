import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const raiz = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function executar(comando, argumentos, opcoes = {}) {
  return new Promise((resolve, reject) => {
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
