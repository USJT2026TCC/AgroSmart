"use strict";
const { avaliarHistorico } = require("./historico");
const { ethers } = require("ethers");

/** Confere os parametros usados no calculo contra o compromisso assinado na cadeia. */
function conferirVinculo({ termos: t, descricaoDosTermos, hashTermos }, cadeia) {
  if (t?.modoHistorico !== true || t.estacao !== "A770" || !/^[a-f0-9]{64}$/.test(t.hashSerie))
    throw new Error("Fonte ou modo historico invalido.");
  if (
    typeof descricaoDosTermos !== "string" ||
    !descricaoDosTermos.startsWith("AgroSmart:historico:v3|")
  )
    throw new Error("Descricao historica ausente ou incompativel.");
  const hash = ethers.keccak256(ethers.toUtf8Bytes(descricaoDosTermos));
  if (
    hash.toLowerCase() !== String(hashTermos).toLowerCase() ||
    hash.toLowerCase() !== String(cadeia.hashTermos).toLowerCase()
  )
    throw new Error("Hash dos termos diverge da apolice.");
  avaliarHistorico({
    linhas: [],
    inicio: t.inicioHistorico,
    fim: t.fimHistorico,
    gatilho: Number(t.limiarClimatico),
  });
  const inicio = Date.parse(`${t.inicioHistorico}T00:00:00Z`) / 1000;
  const fim = Date.parse(`${t.fimHistorico}T23:59:59Z`) / 1000;
  if (
    inicio !== Number(cadeia.vigenciaInicio) ||
    fim !== Number(cadeia.vigenciaFim) ||
    Number(t.limiarClimatico) !== Number(cadeia.limiarClimatico)
  )
    throw new Error("Termos historicos divergentes na cadeia.");
  const partes = descricaoDosTermos.split("|");
  for (const valor of [
    "estacao:A770",
    `sha256-serie:${t.hashSerie}`,
    "parametro:experimental",
    "contagem:inicio-da-cobertura",
    "dia-seco:chuva-inferior-a-1-mm",
    "dia-utilizavel:minimo-20-horas-validas",
    "datas:utc-inclusivas",
    `vigencia-inicio:${inicio}`,
    `vigencia-fim:${fim}`,
    `limiar-climatico:${Number(t.limiarClimatico)}`,
    "pagamento:integral",
  ])
    if (!partes.includes(valor))
      throw new Error("Parametros historicos nao correspondem ao texto assinado.");
}
module.exports = { conferirVinculo };
