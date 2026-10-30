/** Descricoes da condicao de pagamento integral, executada pelo contrato historico. */

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
