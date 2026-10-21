"use strict";
const limites = require("../../configuracao/historico.json");

/** Avaliacao deterministica de uma estacao. Datas UTC, cobertura inclusiva.
 * Contagem parte de zero no inicio; ausencia/incompletude interrompe a sequencia.
 * A primeira data acionadora e preservada, mesmo se chover depois.
 */
function avaliarHistorico({ linhas, inicio, fim, gatilho }) {
  const data = (texto) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw new Error("Data invalida.");
    const t = Date.parse(`${texto}T00:00:00Z`);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== texto)
      throw new Error("Data invalida.");
    return t;
  };
  const de = data(inicio),
    ate = data(fim);
  if (
    inicio < limites.inicio ||
    fim > limites.fim ||
    de > ate ||
    ate - de > 3660 * 86400000 ||
    !Number.isInteger(gatilho) ||
    gatilho < limites.gatilhoMinimo ||
    gatilho > limites.gatilhoMaximo
  )
    throw new Error("Intervalo ou gatilho invalido.");
  if (!Array.isArray(linhas)) throw new Error("Serie historica invalida.");
  const porDia = new Map();
  for (const l of linhas) {
    if (!l || typeof l !== "object") throw new Error("Linha historica invalida.");
    data(l.data);
    if (porDia.has(l.data)) throw new Error("Mais de uma linha para o mesmo dia/estacao.");
    porDia.set(l.data, l);
  }
  let sequencia = 0,
    maiorSequencia = 0,
    diasValidos = 0,
    diasIncompletos = 0,
    primeiroAcionamento = null;
  const dias = [];
  for (let t = de; t <= ate; t += 86400000) {
    const dia = new Date(t).toISOString().slice(0, 10),
      l = porDia.get(dia);
    const valido =
      !!l &&
      Number.isInteger(Number(l.horas_validas)) &&
      Number(l.horas_validas) >= limites.horasMinimas &&
      Number(l.horas_validas) <= 24 &&
      l.chuva_mm !== null &&
      l.chuva_mm !== undefined &&
      ["number", "string"].includes(typeof l.chuva_mm) &&
      String(l.chuva_mm).trim() !== "" &&
      Number.isFinite(Number(l.chuva_mm)) &&
      Number(l.chuva_mm) >= 0 &&
      Number(l.chuva_mm) <= Number(l.horas_validas) * 500;
    if (valido) diasValidos++;
    else diasIncompletos++;
    sequencia = valido && Number(l.chuva_mm) < limites.chuvaDiaSecoMm ? sequencia + 1 : 0;
    maiorSequencia = Math.max(maiorSequencia, sequencia);
    if (!primeiroAcionamento && sequencia >= gatilho) primeiroAcionamento = dia;
    dias.push({
      data: dia,
      chuvaMm: l?.chuva_mm == null ? null : Number(l.chuva_mm),
      horasValidas: Number(l?.horas_validas ?? 0),
      valido,
      indiceClimatico: sequencia,
    });
  }
  return {
    inicio,
    fim,
    gatilho,
    estacao: "A770",
    modo: "reproducao-historica",
    parametroExperimental: true,
    diasValidos,
    diasIncompletos,
    maiorSequencia,
    primeiroAcionamento,
    acionaria: !!primeiroAcionamento,
    percentualBps: primeiroAcionamento ? 10000 : 0,
    dias,
  };
}
module.exports = { avaliarHistorico };
