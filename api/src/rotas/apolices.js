import { Router } from "express";

import { naoEncontrado } from "../erros.js";
import { exigirSessao } from "../seguranca/sessoes.js";
import { endereco } from "../validacao.js";

/**
 * Consulta de apolices (UC06, RF09).
 *
 * O aplicativo continua lendo a apolice direto do contrato, que e a fonte da
 * verdade. O que o backend acrescenta e o que a cadeia nao sabe: a qual talhao e
 * a qual proposta a apolice pertence, o texto completo dos termos, e a
 * procedencia de cada indice publicado.
 */

const SQL_APOLICE = `
  SELECT a.*, t.identificador AS talhao, t.cultura,
         p.id AS proposta_id, p.produtor_id, p.descricao_dos_termos,
         u.nome AS produtor_nome
    FROM apolices a
    LEFT JOIN talhoes t   ON t.id = a.talhao_id
    LEFT JOIN propostas p ON p.id = a.proposta_id
    LEFT JOIN usuarios u  ON u.id = p.produtor_id OR (p.id IS NULL AND u.carteira = a.produtor_carteira)
`;

function apolicePublica(a) {
  return {
    endereco: a.endereco,
    situacao: a.situacao,
    talhao: a.talhao,
    cultura: a.cultura,
    produtor: { carteira: a.produtor_carteira, nome: a.produtor_nome },
    seguradora: a.seguradora_carteira,
    valorIndenizacaoWei: a.valor_indenizacao_wei,
    valorPagoWei: a.valor_pago_wei,
    periodoAcionador: a.periodo_acionador,
    hashTermos: a.hash_termos,
    txEmissao: a.tx_emissao,
    emitidaEm: a.emitida_em,
  };
}

export function rotasDeApolices() {
  const r = Router();

  r.get("/apolices", exigirSessao, async (req, res) => {
    const { banco } = req.app.locals;

    if (req.usuario.perfil === "produtor") {
      // A proposta preserva a titularidade mesmo depois de trocar o vinculo da carteira.
      const { rows } = await banco.query(
        `${SQL_APOLICE} WHERE p.produtor_id = $1 OR
           (a.proposta_id IS NULL AND a.produtor_carteira = $2) ORDER BY a.emitida_em DESC`,
        [req.usuario.id, req.usuario.carteira],
      );

      res.json({ apolices: rows.map(apolicePublica) });
      return;
    }

    const { rows } = await banco.query(`${SQL_APOLICE} ORDER BY a.emitida_em DESC`);
    res.json({ apolices: rows.map(apolicePublica) });
  });

  r.get("/apolices/:endereco", exigirSessao, async (req, res) => {
    const { banco } = req.app.locals;
    const alvo = endereco(req.params.endereco, "endereco");

    const { rows } = await banco.query(`${SQL_APOLICE} WHERE a.endereco = $1`, [alvo]);
    const a = rows[0];

    if (!a) throw naoEncontrado("Apolice");

    // Produtor so ve a propria apolice. Responde como inexistente, e nao como
    // proibido, para nao confirmar que o endereco pertence a alguem.
    const propria = a.proposta_id
      ? a.produtor_id === req.usuario.id
      : Boolean(req.usuario.carteira) && a.produtor_carteira === req.usuario.carteira;
    if (req.usuario.perfil === "produtor" && !propria) {
      throw naoEncontrado("Apolice");
    }

    const [eventos, publicacoes] = await Promise.all([
      banco.query(
        `SELECT nome, bloco, indice_log, tx_hash, argumentos, instante
           FROM eventos_cadeia
          WHERE contrato = $1 OR (nome = 'ApoliceEmitida' AND argumentos->>'apolice' ILIKE $1)
          ORDER BY bloco, indice_log`,
        [alvo],
      ),
      banco.query(
        `SELECT periodo, tx_hash, indice_climatico, gas_usado, latencia_ms, procedencia,
                confirmada_na_cadeia
           FROM publicacoes_oraculo WHERE apolice_endereco = $1 ORDER BY periodo DESC`,
        [alvo],
      ),
    ]);

    res.json({
      apolice: {
        ...apolicePublica(a),
      },
      // RF08: a tela recalcula o resumo deste texto e compara com o do contrato.
      descricaoDosTermos: a.descricao_dos_termos ?? null,
      linhaDoTempo: eventos.rows.map((e) => ({
        nome: e.nome,
        bloco: Number(e.bloco),
        indiceNoBloco: e.indice_log,
        txHash: e.tx_hash,
        argumentos: e.argumentos,
        em: e.instante,
      })),
      publicacoes: publicacoes.rows,
    });
  });

  return r;
}
