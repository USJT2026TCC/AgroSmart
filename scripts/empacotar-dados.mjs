/** Confere o resultado do ETL antes de atualizar o pacote publico usado pela API. */
import limites from "../configuracao/historico.json" with { type: "json" };
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { raiz } from "./processos.mjs";

export function empacotarDados(
  origem = path.join(raiz, "etl/dados/preparado", limites.estacao),
  destino = path.join(raiz, "api/recursos/inmet", limites.estacao),
) {
  const manifesto = JSON.parse(readFileSync(path.join(origem, "manifesto.json"), "utf8"));
  if (
    manifesto.versao !== 1 ||
    manifesto.estacao !== limites.estacao ||
    manifesto.inicio !== limites.inicio ||
    manifesto.fim !== limites.fim
  )
    throw new Error("Recorte preparado incompativel com a entrega.");
  const inicio = Number(limites.inicio.slice(0, 4)),
    fim = Number(limites.fim.slice(0, 4));
  if (Object.keys(manifesto.anos ?? {}).length !== fim - inicio + 1)
    throw new Error("Manifesto deve conter somente os anos do recorte configurado.");
  const arquivos = [];
  for (let ano = inicio; ano <= fim; ano++) {
    const meta = manifesto.anos[ano];
    const primeiro = ano === inicio ? limites.inicio : `${ano}-01-01`;
    const ultimo = ano === fim ? limites.fim : `${ano}-12-31`;
    if (meta?.status !== "preparado" || meta.inicio !== primeiro || meta.fim !== ultimo)
      throw new Error(`Ano ${ano} incompleto ou fora do recorte.`);
    for (const [tipo, chave] of [
      ["original", "sha256Original"],
      ["diario", "sha256Diario"],
    ]) {
      const nome = `${ano}-${tipo}.csv`,
        bytes = readFileSync(path.join(origem, nome));
      if (createHash("sha256").update(bytes).digest("hex") !== meta[chave])
        throw new Error(`Integridade divergente: ${nome}`);
      arquivos.push({ nome, bytes });
    }
  }
  // Confere todos os anos antes da primeira escrita e grava os mesmos bytes verificados.
  mkdirSync(destino, { recursive: true });
  for (const { nome, bytes } of arquivos) writeFileSync(path.join(destino, nome), bytes);
  writeFileSync(path.join(destino, "manifesto.json"), JSON.stringify(manifesto, null, 2) + "\n");
  return { anos: fim - inicio + 1, arquivos: arquivos.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error("O empacotador nao aceita argumentos adicionais.");
    const resultado = empacotarDados();
    console.log(
      `Pacote ${limites.estacao}: ${resultado.anos} anos e ${resultado.arquivos} CSVs conferidos. Nenhum banco ou segredo foi copiado.`,
    );
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}
