import { ethers } from "ethers";

/**
 * Termos da apolice e o resumo criptografico deles (RF08).
 *
 * O contrato guarda `hashTermos`, o keccak256 de um texto que descreve tudo o que
 * foi acordado. Para esse resumo servir de prova, tres coisas precisam valer:
 *
 *  1. o texto e deterministico — os mesmos termos produzem sempre o mesmo texto;
 *  2. o texto e guardado, para que o resumo possa ser recalculado depois;
 *  3. o resumo gravado no contrato e conferido contra o que foi gerado aqui.
 */

/** Texto em bytes32, como o contrato espera para cultura e talhao. */
export function paraBytes32(texto) {
  const valor = String(texto);

  if (ethers.toUtf8Bytes(valor).length > 31) {
    throw new Error(`"${valor}" excede os 31 bytes de um bytes32.`);
  }

  return ethers.encodeBytes32String(valor);
}

/**
 * Descricao canonica dos termos.
 *
 * Campo por campo, em ordem fixa, separados por "|". Nada de JSON: a ordem das
 * chaves de um objeto e um detalhe de implementacao, e um resumo que muda porque
 * alguem reordenou um objeto nao prova nada.
 */
export function descreverTermos(t) {
  return [
    "AgroSmart:historico:v3",
    `estacao:${t.estacao}`,
    `sha256-serie:${t.hashSerie}`,
    "parametro:experimental",
    "contagem:inicio-da-cobertura",
    "dia-seco:chuva-inferior-a-1-mm",
    "dia-utilizavel:minimo-20-horas-validas",
    "datas:utc-inclusivas",
    "talhao:coincidente-com-estacao-por-hipotese",
    "pagamento:integral",
    `apolice-de-proposta:${t.propostaId}`,
    `produtor:${t.carteiraProdutor.toLowerCase()}`,
    `talhao:${t.talhao}`,
    `cultura:${t.cultura}`,
    `limiar-climatico:${t.limiarClimatico}`,
    `limite-wei:${t.valorIndenizacaoWei}`,
    `vigencia-inicio:${t.vigenciaInicio}`,
    `vigencia-fim:${t.vigenciaFim}`,
  ].join("|");
}

export function resumirTermos(descricao) {
  return ethers.keccak256(ethers.toUtf8Bytes(descricao));
}

/**
 * Struct `Termos` exatamente como `ApoliceFactory.emitirApoliceHistorica` espera.
 *
 * Valores grandes vao como texto decimal: o JSON nao representa BigInt, e um
 * Number perderia precisao acima de 2^53. O ethers aceita o texto e converte.
 */
export function montarStructDeTermos(t, hashTermos) {
  return {
    produtor: ethers.getAddress(t.carteiraProdutor),
    registry: ethers.ZeroAddress, // a fabrica sobrescreve com o registro oficial
    cultura: paraBytes32(t.cultura),
    talhao: paraBytes32(t.talhao),
    limiarClimatico: t.limiarClimatico,
    vigenciaInicio: t.vigenciaInicio,
    vigenciaFim: t.vigenciaFim,
    valorIndenizacao: String(t.valorIndenizacaoWei),
    hashTermos,
  };
}
