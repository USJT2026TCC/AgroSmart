import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DIRETORIO_INMET = fileURLToPath(
  new URL("../../recursos/inmet/A770/", import.meta.url),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Importacao transacional por ano; anos identicos nao sao reprocessados. */
export async function importarInmet(banco, diretorio = DIRETORIO_INMET) {
  const manifestoPath = `${diretorio}/manifesto.json`;
  if (!existsSync(manifestoPath))
    throw new Error(
      "Pacote publico INMET ausente. Confira backend/recursos/inmet ou reconstrua e empacote a serie.",
    );
  const manifesto = JSON.parse(readFileSync(manifestoPath, "utf8"));
  if (manifesto.versao !== 1 || manifesto.estacao !== "A770")
    throw new Error("Manifesto INMET incompativel.");
  let anos = 0,
    dias = 0;
  for (const [ano, meta] of Object.entries(manifesto.anos)) {
    if (meta.status !== "preparado" || Number(ano) < 2020 || Number(ano) > 2026)
      continue;
    if (!/^\d{4}$/.test(ano)) throw new Error("Ano invalido no manifesto.");
    const { rows } = await banco.query(
      "SELECT sha256_original, sha256_diario FROM inmet_arquivos WHERE estacao=$1 AND ano=$2",
      [manifesto.estacao, Number(ano)],
    );
    if (
      rows[0]?.sha256_original === meta.sha256Original &&
      rows[0]?.sha256_diario === meta.sha256Diario
    )
      continue;
    const original = readFileSync(`${diretorio}/${ano}-original.csv`);
    const diario = readFileSync(`${diretorio}/${ano}-diario.csv`);
    if (
      hash(original) !== meta.sha256Original ||
      hash(diario) !== meta.sha256Diario
    )
      throw new Error(`SHA-256 divergente no ano ${ano}.`);
    const [cabecalho, ...registros] = diario
      .toString("utf8")
      .trim()
      .split(/\r?\n/);
    if (
      cabecalho !== "data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas"
    )
      throw new Error("CSV diario incompativel.");
    const linhas = registros.map((l) => l.split(","));
    for (const [data, chuva, validas, ausentes, invalidas] of linhas) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
        !data.startsWith(ano) ||
        data < meta.inicio ||
        data > meta.fim ||
        (chuva !== "" &&
          (!Number.isFinite(Number(chuva)) || Number(chuva) < 0)) ||
        [validas, ausentes, invalidas].some(
          (v) => !/^\d+$/.test(v) || Number(v) > 24,
        ) ||
        Number(validas) + Number(ausentes) + Number(invalidas) !== 24
      )
        throw new Error(`Linha diaria invalida: ${data}`);
    }
    await banco.transacao(async (tx) => {
      await tx.query(
        "DELETE FROM inmet_dias WHERE estacao=$1 AND data >= $2::date AND data < ($2::date + interval '1 year')",
        [manifesto.estacao, `${ano}-01-01`],
      );
      await tx.query(
        `INSERT INTO inmet_dias (estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas)
        SELECT $1, * FROM unnest($2::date[],$3::numeric[],$4::smallint[],$5::smallint[],$6::smallint[])`,
        [
          manifesto.estacao,
          linhas.map((l) => l[0]),
          linhas.map((l) => (l[1] === "" ? null : Number(l[1]))),
          ...[2, 3, 4].map((i) => linhas.map((l) => Number(l[i]))),
        ],
      );
      await tx.query(
        `INSERT INTO inmet_arquivos (estacao,ano,sha256_original,sha256_diario,procedencia)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (estacao,ano) DO UPDATE SET sha256_original=excluded.sha256_original,
        sha256_diario=excluded.sha256_diario,procedencia=excluded.procedencia,importado_em=now()`,
        [
          manifesto.estacao,
          Number(ano),
          meta.sha256Original,
          meta.sha256Diario,
          JSON.stringify(meta),
        ],
      );
    });
    anos++;
    dias += linhas.length;
  }
  return { anos, dias };
}
