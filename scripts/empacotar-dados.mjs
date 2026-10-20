import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { raiz } from "./processos.mjs";
const origem = path.join(raiz, "simulador/dados/preparado/A770");
const destino = path.join(raiz, "backend/recursos/inmet/A770");
const manifesto = JSON.parse(
  readFileSync(path.join(origem, "manifesto.json"), "utf8"),
);
if (
  manifesto.versao !== 1 ||
  manifesto.estacao !== "A770" ||
  manifesto.inicio !== "2020-01-01" ||
  manifesto.fim !== "2026-09-30"
)
  throw new Error("Recorte preparado incompativel com a entrega.");
const arquivos = [];
for (let ano = 2020; ano <= 2026; ano++) {
  const meta = manifesto.anos[ano];
  if (meta?.status !== "preparado")
    throw new Error(`Ano ${ano} nao preparado.`);
  for (const [tipo, chave] of [
    ["original", "sha256Original"],
    ["diario", "sha256Diario"],
  ]) {
    const nome = `${ano}-${tipo}.csv`,
      bytes = readFileSync(path.join(origem, nome));
    if (createHash("sha256").update(bytes).digest("hex") !== meta[chave])
      throw new Error(`Integridade divergente: ${nome}`);
    arquivos.push(nome);
  }
}
mkdirSync(destino, { recursive: true });
for (const nome of arquivos)
  copyFileSync(path.join(origem, nome), path.join(destino, nome));
writeFileSync(
  path.join(destino, "manifesto.json"),
  JSON.stringify(manifesto, null, 2) + "\n",
);
console.log(
  "Pacote publico A770 atualizado: sete anos, originais, diarios e manifesto. Nenhum banco ou segredo foi copiado.",
);
