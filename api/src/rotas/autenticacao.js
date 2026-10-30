import { usuarioNoEscopo } from "../../../configuracao/escopo.js";
import { Router } from "express";

import { naoAutenticado } from "../erros.js";
import { conferirSenha, HASH_FICTICIO } from "../seguranca/cripto.js";
import { abrirSessao, exigirSessao, limitarLogin, revogarSessao } from "../seguranca/sessoes.js";
import { texto } from "../validacao.js";

/**
 * Autenticacao (RF04, HU13): login por senha dos dois perfis fixos da
 * demonstracao, sessao por token opaco e encerramento da sessao.
 */

/** Dados do usuario que podem sair na resposta. Nunca inclui hash nem segredo. */
function publico(u) {
  return {
    id: u.id,
    identificador: u.identificador,
    nome: u.nome,
    perfil: u.perfil,
    documento: u.documento,
    carteira: u.carteira,
  };
}

export function rotasDeAutenticacao() {
  const r = Router();

  r.post("/autenticacao/entrar", limitarLogin, async (req, res) => {
    const { banco } = req.app.locals;
    const identificador = texto(req.body?.identificador, "identificador", {
      max: 100,
    }).toLowerCase();
    const senha = texto(req.body?.senha, "senha", { max: 200 });

    const { rows } = await banco.query("SELECT * FROM usuarios WHERE identificador = $1", [
      identificador,
    ]);
    const usuario = rows[0];

    // A senha e conferida mesmo quando o usuario nao existe, contra um hash
    // ficticio. Assim o tempo de resposta nao revela quais identificadores estao
    // cadastrados.
    const confere = await conferirSenha(senha, usuario?.hash_senha ?? HASH_FICTICIO);

    if (!usuarioNoEscopo(usuario) || !confere) {
      throw naoAutenticado("Identificador ou senha invalidos.");
    }

    const token = await abrirSessao(banco, usuario.id, { req });

    res.json({ token, usuario: publico(usuario) });
  });

  r.post("/autenticacao/sair", exigirSessao, async (req, res) => {
    await revogarSessao(req.app.locals.banco, req.token);
    res.status(204).end();
  });

  r.get("/autenticacao/eu", exigirSessao, async (req, res) => {
    res.json({ usuario: publico(req.usuario) });
  });

  return r;
}
