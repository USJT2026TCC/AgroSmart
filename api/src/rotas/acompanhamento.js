import { Router } from "express";

import { naoEncontrado } from "../erros.js";
import { exigirPerfil, exigirSessao } from "../seguranca/sessoes.js";

/**
 * Avisos, indicadores do painel e saude do servico (RF27, RF29).
 */
export function rotasDeAcompanhamento() {
  const r = Router();

  // ------------------------------------------------------- notificacoes

  r.get("/notificacoes", exigirSessao, async (req, res) => {
    const { rows } = await req.app.locals.banco.query(
      `SELECT id, tipo, titulo, mensagem, apolice_endereco, tx_hash, lida_em, criada_em
         FROM notificacoes WHERE usuario_id = $1
        ORDER BY criada_em DESC LIMIT 100`,
      [req.usuario.id],
    );

    res.json({ notificacoes: rows, naoLidas: rows.filter((n) => !n.lida_em).length });
  });

  r.post("/notificacoes/:id/lida", exigirSessao, async (req, res) => {
    const { rowCount } = await req.app.locals.banco.query(
      "UPDATE notificacoes SET lida_em = now() WHERE id = $1 AND usuario_id = $2 AND lida_em IS NULL",
      [Number(req.params.id), req.usuario.id],
    );

    if (rowCount === 0) throw naoEncontrado("Notificacao");
    res.status(204).end();
  });

  r.post("/notificacoes/lidas", exigirSessao, async (req, res) => {
    await req.app.locals.banco.query(
      "UPDATE notificacoes SET lida_em = now() WHERE usuario_id = $1 AND lida_em IS NULL",
      [req.usuario.id],
    );

    res.status(204).end();
  });

  // --------------------------------------------------------- relatorios

  /**
   * Indicadores do painel da seguradora (RF29). A latencia so conta publicacoes
   * confirmadas na rede.
   */
  r.get("/relatorios/carteira", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { banco } = req.app.locals;

    const [carteira, publicacoes, propostas] = await Promise.all([
      banco.query(
        `SELECT count(*)::int                                AS apolices,
                count(*) FILTER (WHERE situacao = 0)::int     AS aguardando_garantia,
                count(*) FILTER (WHERE situacao = 1)::int     AS ativas,
                count(*) FILTER (WHERE situacao = 2)::int     AS liquidadas,
                count(*) FILTER (WHERE situacao = 3)::int     AS encerradas,
                count(*) FILTER (WHERE situacao = 4)::int     AS canceladas,
                COALESCE(sum(valor_indenizacao_wei), 0)::text AS limite_total_wei,
                COALESCE(sum(valor_pago_wei), 0)::text        AS pago_total_wei
           FROM apolices`,
      ),
      banco.query(
        `SELECT count(*)::int AS total, round(avg(latencia_ms))::int AS latencia_media_ms
           FROM publicacoes_oraculo
          WHERE confirmada_na_cadeia AND apolice_endereco IN (SELECT endereco FROM apolices)`,
      ),
      banco.query(
        "SELECT count(*)::int AS pendentes FROM propostas WHERE situacao IN ('pendente', 'preparada')",
      ),
    ]);

    const c = carteira.rows[0];
    res.json({
      carteira: { ...c, taxaDeAcionamento: c.apolices > 0 ? c.liquidadas / c.apolices : 0 },
      publicacoes: publicacoes.rows[0],
      propostasPendentes: propostas.rows[0].pendentes,
    });
  });

  // ------------------------------------------------------------- saude

  r.get("/saude", async (req, res) => {
    const { banco, cadeia, indexador } = req.app.locals;

    const inicio = Date.now();
    await banco.query("SELECT 1");

    res.json({
      situacao: "ok",
      banco: { motor: banco.motor, latenciaMs: Date.now() - inicio },
      cadeia: { contratosImplantados: cadeia.disponivel(), fabrica: cadeia.enderecoDaFabrica() },
      indexador: indexador ? indexador.estado() : { ativo: false },
    });
  });

  return r;
}
