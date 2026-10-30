import { usuarioNoEscopo } from "../../../configuracao/escopo.js";
import rateLimit from "express-rate-limit";

import { config } from "../config.js";
import { naoAutenticado, semPermissao } from "../erros.js";
import { gerarToken, iguaisEmTempoConstante, sha256Hex } from "./cripto.js";

/**
 * Sessoes e controle de acesso.
 *
 * A sessao e um token aleatorio opaco, e nao um JWT. A escolha e deliberada: um
 * JWT e valido ate expirar, e revoga-lo exige uma lista de bloqueio que acaba
 * sendo uma tabela de sessoes de qualquer forma. Com o token opaco, sair do
 * sistema encerra a sessao de verdade, no mesmo instante — o que importa em um
 * sistema em que a seguradora autoriza quem publica o indice que move dinheiro.
 *
 * O banco guarda so o resumo SHA-256 do token. Quem ler a tabela de sessoes nao
 * consegue se passar por ninguem.
 */

/**
 * Abre uma sessao.
 * @returns {Promise<string>} O token, que so existe nesta resposta.
 */
export async function abrirSessao(banco, usuarioId, { req } = {}) {
  const token = gerarToken();

  await banco.query(
    `INSERT INTO sessoes (usuario_id, hash_token, expira_em, ip, agente)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
    [
      usuarioId,
      sha256Hex(token),
      Math.round(config.horasDeSessao * 3600),
      req?.ip ?? null,
      req?.get?.("user-agent")?.slice(0, 200) ?? null,
    ],
  );

  return token;
}

export async function revogarSessao(banco, token) {
  await banco.query(
    "UPDATE sessoes SET revogada_em = now() WHERE hash_token = $1 AND revogada_em IS NULL",
    [sha256Hex(token)],
  );
}

/** Extrai o token do cabecalho `Authorization: Bearer <token>`. */
function tokenDaRequisicao(req) {
  const cabecalho = req.get("authorization") ?? "";
  const [tipo, token] = cabecalho.split(" ");

  return tipo?.toLowerCase() === "bearer" && token ? token : null;
}

/** Busca a sessao valida correspondente ao token. */
async function buscarSessao(banco, token) {
  const { rows } = await banco.query(
    `SELECT s.id AS sessao_id,
            u.id, u.identificador, u.nome, u.perfil, u.documento, u.carteira
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.hash_token = $1
        AND s.revogada_em IS NULL
        AND s.expira_em > now()`,
    [sha256Hex(token)],
  );

  return usuarioNoEscopo(rows[0]) ? rows[0] : null;
}

/** Exige sessao valida, nao revogada e dentro do prazo. */
export async function exigirSessao(req, _res, proximo) {
  const token = tokenDaRequisicao(req);
  if (!token) throw naoAutenticado();

  const sessao = await buscarSessao(req.app.locals.banco, token);
  if (!sessao) throw naoAutenticado();

  req.usuario = sessao;
  req.token = token;
  proximo();
}

/**
 * Exige um dos perfis informados (RF04, RNF10).
 *
 * E esta verificacao, no servidor, que protege de verdade. A do aplicativo so
 * esconde menus: um cliente adulterado a contorna, esta nao.
 */
export function exigirPerfil(...perfis) {
  return (req, _res, proximo) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) throw semPermissao();
    proximo();
  };
}

/**
 * Autenticacao do servico interno do oraculo.
 *
 * Chave compartilhada no cabecalho `X-Chave-De-Servico`, comparada em tempo
 * constante. Nao e a chave privada do oraculo na cadeia — essa assina transacoes
 * e nunca sai da maquina do oraculo. Esta so autentica o oraculo perante a API.
 */
export function exigirServico(req, _res, proximo) {
  const informada = req.get("x-chave-de-servico");

  if (!informada || !iguaisEmTempoConstante(informada, config.chaveDeServico)) {
    throw naoAutenticado("Chave de servico ausente ou invalida.");
  }

  proximo();
}

// ------------------------------------------------------------ limitadores

/**
 * Limite de requisicoes por origem nas rotas sensiveis.
 *
 * No login, dez tentativas por quinze minutos: suficiente para quem errou a senha
 * algumas vezes, inutil para quem tenta adivinha-la.
 */
export const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.limiteDeLogin,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    erro: {
      codigo: "muitas_tentativas",
      mensagem: "Muitas tentativas de login. Aguarde alguns minutos.",
    },
  },
});
