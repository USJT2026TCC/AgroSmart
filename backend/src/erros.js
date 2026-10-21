/**
 * Erros da API.
 *
 * Toda resposta de erro tem o mesmo formato — `{ erro: { codigo, mensagem } }` —
 * para que o aplicativo trate falha de um jeito so. O `codigo` e estavel e serve
 * para o programa decidir o que fazer; a `mensagem` e para a pessoa ler.
 */
export class ErroDaApi extends Error {
  /**
   * @param {number} status Codigo HTTP.
   * @param {string} codigo Identificador estavel, em minusculas com sublinhado.
   * @param {string} mensagem Texto legivel.
   * @param {object} [detalhes] Informacao adicional, quando ajuda a corrigir o pedido.
   */
  constructor(status, codigo, mensagem, detalhes = undefined) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export const naoAutenticado = (mensagem = "Sessao ausente ou expirada.") =>
  new ErroDaApi(401, "nao_autenticado", mensagem);

export const semPermissao = (mensagem = "Este perfil nao tem acesso a esta operacao.") =>
  new ErroDaApi(403, "sem_permissao", mensagem);

export const naoEncontrado = (recurso) =>
  new ErroDaApi(404, "nao_encontrado", `${recurso} nao encontrado.`);

export const pedidoInvalido = (mensagem, detalhes) =>
  new ErroDaApi(400, "pedido_invalido", mensagem, detalhes);

export const conflito = (mensagem, detalhes) => new ErroDaApi(409, "conflito", mensagem, detalhes);

/**
 * Traduz violacoes de restricao do PostgreSQL em erro de pedido.
 *
 * Varias regras de negocio estao no esquema — produto que o contrato recusaria,
 * poligono com autointersecao, carteira ja vinculada. Quando uma delas dispara, a
 * resposta certa e 400 ou 409 com uma frase util, e nao 500.
 */
const RESTRICOES = {
  talhoes_geometria_check: [400, "O poligono cruza a si mesmo ou nao e valido."],
  talhoes_identificador_key: [409, "Ja existe um talhao com este identificador."],
  talhoes_identificador_check: [400, "O identificador do talhao precisa ter de 1 a 31 caracteres."],
  produto_limiar_climatico: [400, "O produto exige um gatilho climatico maior que zero."],
  produto_pagamento_integral: [
    400,
    "O produto ativo aceita apenas indenizacao integral em parcela unica.",
  ],
  produto_teto_climatico: [400, "Configuracao climatica legada invalida."],
  usuarios_carteira_key: [409, "Esta carteira ja esta vinculada a outro usuario."],
  usuarios_identificador_key: [409, "Ja existe um usuario com este identificador."],
};

export function traduzirErroDoBanco(erro) {
  // 23505 = violacao de unicidade; 23514 = violacao de CHECK.
  if (erro?.code !== "23505" && erro?.code !== "23514") return null;

  const conhecida = RESTRICOES[erro.constraint];

  if (conhecida) {
    const [status, mensagem] = conhecida;
    return new ErroDaApi(status, status === 409 ? "conflito" : "pedido_invalido", mensagem);
  }

  return erro.code === "23505"
    ? conflito("Registro duplicado.")
    : pedidoInvalido("Valor fora das regras do cadastro.");
}

/** Middleware final do Express. */
export function tratarErros(erro, req, res, _proximo) {
  const traduzido = erro instanceof ErroDaApi ? erro : traduzirErroDoBanco(erro);

  if (traduzido) {
    res.status(traduzido.status).json({
      erro: {
        codigo: traduzido.codigo,
        mensagem: traduzido.message,
        ...(traduzido.detalhes ? { detalhes: traduzido.detalhes } : {}),
      },
    });
    return;
  }

  // JSON malformado no corpo da requisicao.
  if (erro?.type === "entity.parse.failed") {
    res.status(400).json({ erro: { codigo: "json_invalido", mensagem: "Corpo JSON invalido." } });
    return;
  }

  // Qualquer outra coisa e defeito do servidor. A mensagem interna vai para o log,
  // nao para o cliente: um erro de SQL na resposta entrega a estrutura do banco.
  console.error(`[erro] ${req.method} ${req.originalUrl}:`, erro);
  res.status(500).json({ erro: { codigo: "erro_interno", mensagem: "Erro interno do servidor." } });
}
