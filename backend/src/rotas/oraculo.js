import { Router } from "express";
import { hashDaSerie } from "../dominio/reproducao.js";

import { naoEncontrado, pedidoInvalido } from "../erros.js";
import { auditar, exigirServico } from "../seguranca/sessoes.js";
import {
  endereco,
  hashDeTransacao,
  inteiro,
  periodo,
  texto,
} from "../validacao.js";

/** Interface autenticada entre backend e oraculo.
 * No modo historico, a API entrega dias de inmet_dias e termos congelados;
 * o oraculo recalcula a serie, o indice e assina a publicacao em cadeia.
 * As rotas de leituras e reputacao abaixo pertencem ao percurso legado.
 * O INMET nao assina os arquivos com a chave do servico ou do oraculo.
 */

/** Formato de periodo AAAAMMDD para data UTC no fim daquele dia. */
function fimDoDia(p) {
  const t = String(p);
  return new Date(
    Date.UTC(
      Number(t.slice(0, 4)),
      Number(t.slice(4, 6)) - 1,
      Number(t.slice(6, 8)),
      23,
      59,
      59,
    ),
  );
}

export function rotasDoOraculo() {
  const r = Router();

  r.use("/oraculo", exigirServico);

  /**
   * Apolices que podem receber publicacao agora, com o talhao e as fontes.
   *
   * Situacao 1 e ATIVA. A situacao aqui e um espelho atualizado pelo indexador;
   * o contrato continua sendo a autoridade, e o oraculo ensaia a chamada antes
   * de gastar gas.
   */
  r.get("/oraculo/serie-historica", async (req, res) => {
    const apolice = endereco(req.query.apolice, "apolice");
    const banco = req.app.locals.banco;
    const { rows } = await banco.query(
      "SELECT p.termos FROM propostas p JOIN apolices a ON a.proposta_id=p.id WHERE a.endereco=$1",
      [apolice],
    );
    const t = rows[0]?.termos;
    if (!t?.modoHistorico) throw pedidoInvalido("Apolice nao e historica.");
    if (
      (await hashDaSerie(banco, t.inicioHistorico, t.fimHistorico)) !==
      t.hashSerie
    )
      throw pedidoInvalido(
        "Serie INMET mudou desde a proposta. Emita outra proposta; nao altere os termos.",
      );
    const { rows: linhas } = await banco.query(
      "SELECT data::text,chuva_mm,horas_validas FROM inmet_dias WHERE estacao='A770' AND data BETWEEN $1 AND $2 ORDER BY data",
      [t.inicioHistorico, t.fimHistorico],
    );
    res.json({ termos: t, linhas });
  });

  r.get("/oraculo/apolices-ativas", async (req, res) => {
    const { rows } = await req.app.locals.banco.query(
      `SELECT a.endereco, a.produtor_carteira, a.valor_indenizacao_wei,
              t.id AS talhao_id, t.identificador AS talhao,
              p.termos,
              COALESCE(
                (SELECT json_agg(json_build_object('id', f.id, 'tipo', f.tipo, 'escore', f.escore) ORDER BY f.id)
                   FROM fontes f WHERE f.talhao_id = t.id AND f.ativa),
                '[]'::json
              ) AS fontes
         FROM apolices a
         LEFT JOIN talhoes t   ON t.id = a.talhao_id
         LEFT JOIN propostas p ON p.id = a.proposta_id
        WHERE a.situacao = 1
        ORDER BY a.emitida_em`,
    );

    res.json({ apolices: rows });
  });

  /**
   * Leituras de um talhao, no formato que `consolidarIndiceClimatico` espera.
   *
   * Vao TODAS as leituras das fontes ativas, validas e invalidas. O oraculo
   * revalida por conta propria, e a propria contagem de descartes entra na
   * procedencia que ele grava junto com a publicacao.
   */
  r.get("/oraculo/leituras", async (req, res) => {
    const { banco } = req.app.locals;
    const talhao = texto(req.query.talhao, "talhao", { max: 31 });
    const ate = periodo(req.query.ate, "ate");
    const dias = inteiro(req.query.dias ?? 90, "dias", { min: 1, max: 366 });

    const { rows: talhoes } = await banco.query(
      "SELECT id FROM talhoes WHERE identificador = $1",
      [talhao],
    );
    if (!talhoes[0]) throw naoEncontrado("Talhao");

    const limite = fimDoDia(ate);

    const { rows } = await banco.query(
      `SELECT l.fonte_id AS fonte, l.instante, l.chuva_mm, l.temperatura_c, l.umidade_pct
         FROM leituras l JOIN fontes f ON f.id = l.fonte_id
        WHERE f.talhao_id = $1 AND f.ativa
          AND l.instante <= $2
          AND l.instante > $2::timestamptz - make_interval(days => $3)
        ORDER BY l.instante`,
      [talhoes[0].id, limite, dias],
    );

    // numeric chega como texto; o consolidador espera numero.
    const numero = (v) => (v === null ? undefined : Number(v));

    res.json({
      talhao,
      ate,
      leituras: rows.map((l) => ({
        fonte: l.fonte,
        timestamp: new Date(l.instante).toISOString(),
        chuvaMm: numero(l.chuva_mm),
        temperaturaC: numero(l.temperatura_c),
        umidadePct: numero(l.umidade_pct),
      })),
    });
  });

  /**
   * Relato de publicacao (RF22).
   *
   * Grava o que a cadeia nao guarda: gas estimado, latencia entre envio e
   * confirmacao, e a procedencia do indice. A publicacao so e marcada como
   * confirmada quando o indexador encontra o evento na rede — o relato sozinho
   * e so a palavra do oraculo.
   */
  r.post("/oraculo/publicacoes", async (req, res) => {
    const { banco } = req.app.locals;
    const c = req.body ?? {};

    const apolice = endereco(c.apolice, "apolice");
    const txHash = hashDeTransacao(c.txHash);
    const p = periodo(c.periodo);

    const enviadoEm = c.enviadoEm ? new Date(c.enviadoEm) : null;
    const confirmadoEm = c.confirmadoEm ? new Date(c.confirmadoEm) : null;
    const latencia =
      enviadoEm && confirmadoEm
        ? Math.max(0, confirmadoEm.getTime() - enviadoEm.getTime())
        : null;

    const inteiroOuNulo = (v) =>
      v === undefined || v === null || v === "" ? null : String(BigInt(v));

    // O indexador pode ter visto o evento antes de o relato chegar. Nesse caso a
    // publicacao nasce ja confirmada.
    const { rows: vistos } = await banco.query(
      `SELECT 1 FROM eventos_cadeia
        WHERE contrato = $1 AND nome = 'IndicesPublicados' AND (argumentos->>'periodo')::int = $2`,
      [apolice, p],
    );

    await banco.query(
      `INSERT INTO publicacoes_oraculo
         (apolice_endereco, periodo, tx_hash, indice_climatico,
          gas_usado, gas_estimado, custo_wei, bloco, enviado_em, confirmado_em, latencia_ms,
          acionou_pagamento, procedencia, oraculo, confirmada_na_cadeia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        apolice,
        p,
        txHash,
        inteiro(c.indiceClimatico, "indiceClimatico", {
          min: 0,
          max: 4294967295,
        }),
        inteiroOuNulo(c.gasUsado),
        inteiroOuNulo(c.gasEstimado),
        inteiroOuNulo(c.custoWei),
        c.bloco ?? null,
        enviadoEm,
        confirmadoEm,
        latencia,
        Boolean(c.acionouPagamento),
        c.procedencia ? JSON.stringify(c.procedencia) : null,
        c.oraculo ? String(c.oraculo).toLowerCase() : null,
        vistos.length > 0,
      ],
    );

    await auditar(banco, req, "publicacao_relatada", {
      recurso: apolice,
      txHash,
      detalhes: { periodo: p },
    });

    res
      .status(201)
      .json({ registrada: true, confirmadaNaCadeia: vistos.length > 0 });
  });

  /**
   * Relato de falha de publicacao (RF27: notificar falhas).
   *
   * Quando o oraculo esgota as tentativas, a seguradora precisa saber: ha um
   * periodo sem indice publicado, e a apolice pode estar deixando de acionar.
   */
  r.post("/oraculo/falhas", async (req, res) => {
    const { banco } = req.app.locals;
    const c = req.body ?? {};

    const apolice = endereco(c.apolice, "apolice");
    const p = periodo(c.periodo);
    const motivo = texto(c.motivo, "motivo", { max: 500 });

    if (!Number.isInteger(c.tentativas ?? 0))
      throw pedidoInvalido('O campo "tentativas" deve ser inteiro.');

    const { rows: seguradoras } = await banco.query(
      "SELECT id FROM usuarios WHERE perfil = 'seguradora'",
    );

    for (const { id } of seguradoras) {
      await banco.query(
        `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, apolice_endereco, tx_hash)
         VALUES ($1, 'falha_de_publicacao', $2, $3, $4, $5)
         ON CONFLICT (usuario_id, tipo, tx_hash) DO NOTHING`,
        [
          id,
          "Falha na publicacao do oraculo",
          `O periodo ${p} nao foi publicado apos ${c.tentativas ?? "varias"} tentativa(s): ${motivo}`,
          apolice,
          // Sem transacao, a chave de unicidade usa apolice e periodo, para que o
          // mesmo relato repetido nao notifique duas vezes.
          `falha:${apolice}:${p}`,
        ],
      );
    }

    await auditar(banco, req, "falha_de_publicacao", {
      recurso: apolice,
      detalhes: { periodo: p, motivo },
    });

    res.status(201).json({ notificados: seguradoras.length });
  });

  return r;
}
