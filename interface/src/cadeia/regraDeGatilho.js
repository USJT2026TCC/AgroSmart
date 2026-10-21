/**
 * A regra que decide se a condicao contratada foi atendida e quanto se paga.
 *
 * Este arquivo e uma reimplementacao, em JavaScript, da funcao `_percentualDevido`
 * de `blockchain/contracts/ApoliceHistorica.sol`.
 *
 * Reimplementar a regra no front-end e um risco conhecido: as duas copias podem
 * divergir, e a tela passaria a mostrar ao produtor um numero diferente do que o
 * contrato vai executar. O RNF04 exige apresentar a condicao contratada em
 * linguagem nao tecnica antes do aceite, com exemplos numericos — se esses
 * exemplos mentirem, o requisito e pior do que nao ter sido atendido.
 *
 * Duas coisas impedem a divergencia:
 *
 * 1. Depois que a apolice existe na cadeia, a tela usa `simularPercentual` do
 *    proprio contrato, e nao esta funcao. Aqui so entra na cotacao, quando ainda
 *    nao ha contrato implantado para consultar.
 *
 * 2. `testes/blockchain/unitarios/RegraDeGatilho.test.js` importa este arquivo e compara,
 *    caso a caso, a saida dele com a saida do contrato. Se alguem mexer em um dos
 *    dois lados, a suite de testes quebra.
 *
 * Toda a aritmetica usa inteiros, como na EVM. Nenhuma operacao com ponto
 * flutuante entra no caminho do calculo, porque arredondamento diferente entre as
 * duas implementacoes e exatamente o tipo de divergencia que se quer evitar.
 */

/** Base de pontos: 10000 bps = 100,00%. */
export const BPS = 10_000;

export const MODO_PAGAMENTO = { INTEGRAL: 0 };

/** Rotulos das situacoes da apolice, na ordem do enum Situacao do contrato. */
export const SITUACAO = ["AGUARDANDO_GARANTIA", "ATIVA", "LIQUIDADA", "ENCERRADA", "CANCELADA"];

function exigirPagamentoIntegral(t) {
  if (Number(t.modoPagamento) !== 0 || Number(t.limiarClimaticoIntegral) !== 0) {
    throw new Error("Esta versao aceita apenas indenizacao integral em parcela unica.");
  }
}

/**
 * Percentual devido para um indice climatico, em pontos-base.
 *
 * @param {object} termos Termos da apolice, nos mesmos campos do contrato.
 * @param {number} indiceClimatico Dias consecutivos sem chuva.
 * @returns {number} Percentual em bps. Zero significa condicao nao atendida.
 */
export function percentualDevido(termos, indiceClimatico) {
  exigirPagamentoIntegral(termos);
  return Number(indiceClimatico) < Number(termos.limiarClimatico) ? 0 : BPS;
}

/**
 * Valor devido em wei, a partir do limite contratado.
 *
 * Usa BigInt porque o limite vem em wei e um valor em ether nao cabe com
 * precisao em um Number.
 */
export function valorDevido(termos, indiceClimatico) {
  const percentual = percentualDevido(termos, indiceClimatico);

  return (BigInt(termos.valorIndenizacao) * BigInt(percentual)) / BigInt(BPS);
}

/**
 * Exemplos numericos do que aciona e do que nao aciona o pagamento.
 *
 * E o que a tela de cotacao mostra ao produtor antes do aceite (RNF04, e o
 * criterio de aceite 2 da HU10). A escolha dos pontos e deliberada: um pouco
 * abaixo do gatilho, exatamente no gatilho, e dois casos acima — porque e no
 * limite que o produtor costuma se surpreender depois.
 */
export function exemplosDeAcionamento(termos) {
  const gatilho = Number(termos.limiarClimatico);
  const teto = Number(termos.limiarClimaticoIntegral);

  const pontos = [
    Math.max(0, gatilho - 10),
    Math.max(0, gatilho - 1),
    gatilho,
    gatilho + Math.max(1, Math.round((teto - gatilho) / 2)),
    teto > gatilho ? teto : gatilho + 15,
  ];

  return [...new Set(pontos)]
    .filter((dias) => dias >= 0)
    .sort((a, b) => a - b)
    .map((diasSemChuva) => ({
      diasSemChuva,
      percentualBps: percentualDevido(termos, diasSemChuva),
      valorWei: valorDevido(termos, diasSemChuva),
    }));
}

/**
 * A condicao contratada em uma frase, sem jargao (RNF04).
 *
 * Usada na cotacao, para o produtor, e no cadastro do produto, para a
 * seguradora conferir o que esta configurando antes de salvar.
 *
 * @param {object} t Termos: modoPagamento e limiares climaticos.
 */
export function condicaoEmPalavras(t) {
  exigirPagamentoIntegral(t);
  return `Ao atingir ${t.limiarClimatico} dias seguidos com chuva diaria inferior a 1 mm, durante a vigencia, o contrato paga 100% do limite em parcela unica. Gatilho experimental, sem calibracao agronomica por cultura.`;
}
