"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Compara a resposta da API ao pacote publico cujo compromisso consta nos termos. */
function conferirSerie(
  linhas,
  termos,
  diretorio = path.resolve(__dirname, "../../api/recursos/inmet/A770"),
) {
  const manifesto = JSON.parse(fs.readFileSync(path.join(diretorio, "manifesto.json"), "utf8"));
  if (manifesto.estacao !== "A770" || manifesto.versao !== 1)
    throw new Error("Pacote INMET incompativel.");
  const arquivos = [],
    esperados = [];
  for (
    let ano = Number(termos.inicioHistorico.slice(0, 4));
    ano <= Number(termos.fimHistorico.slice(0, 4));
    ano++
  ) {
    const meta = manifesto.anos[ano];
    if (meta?.status !== "preparado") throw new Error("Ano ausente no pacote INMET.");
    const bruto = fs.readFileSync(path.join(diretorio, `${ano}-original.csv`));
    const diario = fs.readFileSync(path.join(diretorio, `${ano}-diario.csv`));
    if (hash(bruto) !== meta.sha256Original || hash(diario) !== meta.sha256Diario)
      throw new Error("Integridade do pacote INMET divergente.");
    arquivos.push({ ano, sha256_original: meta.sha256Original, sha256_diario: meta.sha256Diario });
    const registros = diario.toString("utf8").trimEnd().split(/\r?\n/);
    if (registros.shift() !== "data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas")
      throw new Error("Cabecalho diario INMET incompativel.");
    for (const registro of registros) {
      const [data, chuva, horas] = registro.split(",");
      if (data >= termos.inicioHistorico && data <= termos.fimHistorico)
        esperados.push({
          data,
          chuva_mm: chuva === "" ? null : Number(chuva),
          horas_validas: Number(horas),
        });
    }
  }
  if (hash(JSON.stringify(arquivos)) !== termos.hashSerie)
    throw new Error("Pacote difere da serie contratada.");
  if (!Array.isArray(linhas) || linhas.length !== esperados.length)
    throw new Error("Serie da API difere do pacote.");
  for (let i = 0; i < esperados.length; i++) {
    const a = linhas[i],
      b = esperados[i];
    const chuva =
      a?.chuva_mm == null || String(a.chuva_mm).trim() === "" ? null : Number(a.chuva_mm);
    if (a?.data !== b.data || chuva !== b.chuva_mm || Number(a.horas_validas) !== b.horas_validas)
      throw new Error("Serie da API difere do pacote.");
  }
}
module.exports = { conferirSerie };
