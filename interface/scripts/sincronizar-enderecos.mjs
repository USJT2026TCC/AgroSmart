/** Usa somente o manifesto público atual, compartilhado pela API e pelo oráculo. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
const origem = join(aqui, "../../blockchain/implantacoes/sepolia.json");
const destino = join(aqui, "../src/cadeia/implantacoes.json");
const manifesto = JSON.parse(readFileSync(origem, "utf8"));
if (manifesto.chainId !== 11155111 || !manifesto.contratos?.ApoliceFactory)
  throw new Error("Manifesto Sepolia invalido.");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, JSON.stringify({ sepolia: manifesto }, null, 2) + "\n");
console.log("Enderecos Sepolia sincronizados.");
