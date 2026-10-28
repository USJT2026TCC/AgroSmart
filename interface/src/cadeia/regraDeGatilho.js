/**
 * A regra de pagamento como as telas a apresentam.
 *
 * A decisao de pagar e do contrato (`_percentualDevido` em
 * `blockchain/contracts/ApoliceHistorica.sol`): a interface nao recalcula o
 * valor devido, so descreve a condicao em linguagem corrente (RNF04).
 */

/** Base de pontos: 10000 bps = 100,00%. */
export const BPS = 10_000;

/** Rotulos das situacoes da apolice, na ordem do enum Situacao do contrato. */
export const SITUACAO = ["AGUARDANDO_GARANTIA", "ATIVA", "LIQUIDADA", "ENCERRADA", "CANCELADA"];

/**
 * A condicao contratada em uma frase, sem jargao (RNF04), mostrada na cotacao.
 *
 * @param {object} t Termos, com o gatilho em `limiarClimatico`.
 */
export function condicaoEmPalavras(t) {
  return `Se houver ${t.limiarClimatico} dias seguidos com menos de 1 mm de chuva durante a cobertura, o contrato paga 100% da indenização, de uma vez.`;
}
