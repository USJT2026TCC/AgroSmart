import limites from "../../../configuracao/historico.json" with { type: "json" };
import { createHash } from "node:crypto";
import { pedidoInvalido } from "../erros.js";

function dataHistorica(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor))
    throw pedidoInvalido("Data historica invalida.");
  const t = Date.parse(`${valor}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== valor)
    throw pedidoInvalido("Data historica invalida.");
  return valor;
}
export async function hashDaSerie(banco, inicio, fim) {
  const { rows } = await banco.query(
    "SELECT ano,sha256_original,sha256_diario FROM inmet_arquivos WHERE estacao=$3 AND ano BETWEEN $1 AND $2 ORDER BY ano",
    [Number(inicio.slice(0, 4)), Number(fim.slice(0, 4)), limites.estacao],
  );
  if (rows.length !== Number(fim.slice(0, 4)) - Number(inicio.slice(0, 4)) + 1)
    throw pedidoInvalido("Prepare os dados do INMET antes de contratar a demonstracao historica.");
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
export async function termosHistoricos(banco, corpo, base) {
  const inicio = dataHistorica(corpo.inicioDaVigencia),
    fim = dataHistorica(corpo.fimDaVigencia);
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000 + 1;
  if (inicio < limites.inicio || fim > limites.fim || dias < 1 || dias > 3660)
    throw pedidoInvalido(
      "Cobertura historica deve estar entre 2020 e setembro de 2026, com ate 3660 dias.",
    );
  const gatilho = corpo.gatilhoDias;
  if (
    !Number.isInteger(gatilho) ||
    gatilho < limites.gatilhoMinimo ||
    gatilho > limites.gatilhoMaximo
  )
    throw pedidoInvalido("Gatilho experimental deve ser inteiro entre 1 e 366 dias.");
  const { rows } = await banco.query(
    "SELECT count(*) FILTER (WHERE horas_validas BETWEEN $4 AND 24 AND chuva_mm IS NOT NULL AND chuva_mm>=0 AND chuva_mm<=horas_validas*500)::int AS validos FROM inmet_dias WHERE estacao=$3 AND data BETWEEN $1 AND $2",
    [inicio, fim, limites.estacao, limites.horasMinimas],
  );
  if (!rows[0]?.validos)
    throw pedidoInvalido("Nao ha dias validos importados para essa cobertura.");
  if (rows[0].validos < dias)
    throw pedidoInvalido(
      `Cobertura contem ${dias - rows[0].validos} dias incompletos ou ausentes. Escolha um periodo completo; lacunas nao sao preenchidas.`,
    );
  return {
    ...base,
    modoHistorico: true,
    estacao: limites.estacao,
    inicioHistorico: inicio,
    fimHistorico: fim,
    limiarClimatico: gatilho,
    vigenciaDias: dias,
    hashSerie: await hashDaSerie(banco, inicio, fim),
    diasIncompletos: dias - rows[0].validos,
  };
}
