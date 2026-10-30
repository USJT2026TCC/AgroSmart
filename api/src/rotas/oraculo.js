import limites from "../../../configuracao/historico.json" with { type: "json" };
import { Router } from "express";
import { hashDaSerie } from "../dominio/reproducao.js";

import { conflito, pedidoInvalido } from "../erros.js";
import { exigirServico } from "../seguranca/sessoes.js";
import { endereco, hashDeTransacao, inteiro, periodo, texto } from "../validacao.js";

/** Interface autenticada entre backend e oraculo.
 * No modo historico, a API entrega dias de inmet_dias e termos congelados;
 * o oraculo recalcula a serie, o indice e assina a publicacao em cadeia.
 * O INMET nao assina os arquivos com a chave do servico ou do oraculo.
 */

export function rotasDoOraculo() {
  const r = Router();

  r.use("/oraculo", exigirServico);

  /** Termos congelados da proposta e a chuva diaria da cobertura, para o oraculo conferir. */
  r.get("/oraculo/serie-historica", async (req, res) => {
    const apolice = endereco(req.query.apolice, "apolice");
    const banco = req.app.locals.banco;
    const { rows } = await banco.query(
      "SELECT p.termos,p.descricao_dos_termos,p.hash_termos FROM propostas p JOIN apolices a ON a.proposta_id=p.id WHERE a.endereco=$1",
      [apolice],
    );
    const t = rows[0]?.termos;
    if (!t?.modoHistorico) throw pedidoInvalido("Apolice nao e historica.");
    if ((await hashDaSerie(banco, t.inicioHistorico, t.fimHistorico)) !== t.hashSerie)
      throw pedidoInvalido(
        "Serie INMET mudou desde a proposta. Emita outra proposta; nao altere os termos.",
      );
    const { rows: linhas } = await banco.query(
      "SELECT data::text,chuva_mm,horas_validas FROM inmet_dias WHERE estacao=$3 AND data BETWEEN $1 AND $2 ORDER BY data",
      [t.inicioHistorico, t.fimHistorico, limites.estacao],
    );
    res.json({
      termos: t,
      linhas,
      descricaoDosTermos: rows[0].descricao_dos_termos,
      hashTermos: rows[0].hash_termos,
    });
  });

  /**
   * Enderecos das apolices ativas (situacao 1) de propostas historicas emitidas.
   * A situacao e um espelho do indexador; o oraculo ensaia a chamada no contrato
   * antes de gastar gas.
   */
  r.get("/oraculo/apolices-ativas", async (req, res) => {
    const { rows } = await req.app.locals.banco.query(
      `SELECT a.endereco
         FROM apolices a
         JOIN propostas p ON p.id = a.proposta_id
        WHERE a.situacao = 1 AND p.situacao = 'emitida'
          AND p.termos->>'modoHistorico' = 'true'
          AND p.hash_termos = a.hash_termos
          AND p.descricao_dos_termos IS NOT NULL
        ORDER BY a.emitida_em`,
    );

    res.json({ apolices: rows });
  });

  /**
   * Relato de publicacao (RF22).
   *
   * Grava o que a cadeia nao guarda: gas usado, latencia entre envio e
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
    if (
      (enviadoEm && !Number.isFinite(enviadoEm.getTime())) ||
      (confirmadoEm && !Number.isFinite(confirmadoEm.getTime())) ||
      (enviadoEm && confirmadoEm && confirmadoEm < enviadoEm)
    )
      throw pedidoInvalido("Datas do relato invalidas ou fora de ordem.");
    const latencia =
      enviadoEm && confirmadoEm && !c.recuperada
        ? Math.max(0, confirmadoEm.getTime() - enviadoEm.getTime())
        : null;

    const gasUsado =
      c.gasUsado === undefined || c.gasUsado === null || c.gasUsado === "" ? null : c.gasUsado;
    if (gasUsado !== null && !/^[0-9]+$/.test(String(gasUsado)))
      throw pedidoInvalido("Gas deve ser inteiro nao negativo.");

    // O indexador pode ter visto o evento antes de o relato chegar. Nesse caso a
    // publicacao nasce ja confirmada.
    const { rows: vistos } = await banco.query(
      `SELECT 1 FROM eventos_cadeia
        WHERE contrato = $1 AND nome = 'IndicesPublicados' AND (argumentos->>'periodo')::int = $2
          AND tx_hash = $3 AND (argumentos->>'indiceClimatico')::int = $4`,
      [
        apolice,
        p,
        txHash,
        inteiro(c.indiceClimatico, "indiceClimatico", { min: 0, max: 4294967295 }),
      ],
    );

    const { rows: registradas } = await banco.query(
      `INSERT INTO publicacoes_oraculo AS atual
         (apolice_endereco, periodo, tx_hash, indice_climatico,
          gas_usado, latencia_ms, procedencia, confirmada_na_cadeia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tx_hash) DO UPDATE
         SET gas_usado = COALESCE(atual.gas_usado, EXCLUDED.gas_usado),
             latencia_ms = COALESCE(atual.latencia_ms, EXCLUDED.latencia_ms),
             procedencia = COALESCE(atual.procedencia, EXCLUDED.procedencia),
             confirmada_na_cadeia = atual.confirmada_na_cadeia OR EXCLUDED.confirmada_na_cadeia
       WHERE atual.apolice_endereco = EXCLUDED.apolice_endereco
         AND atual.periodo = EXCLUDED.periodo
         AND atual.indice_climatico = EXCLUDED.indice_climatico
       RETURNING confirmada_na_cadeia`,
      [
        apolice,
        p,
        txHash,
        inteiro(c.indiceClimatico, "indiceClimatico", {
          min: 0,
          max: 4294967295,
        }),
        gasUsado === null ? null : String(BigInt(gasUsado)),
        latencia,
        c.procedencia ? JSON.stringify(c.procedencia) : null,
        vistos.length > 0,
      ],
    );

    if (!registradas.length)
      throw conflito("Esta transação já foi relatada com outra apólice, período ou índice.");
    res.status(201).json({
      registrada: true,
      confirmadaNaCadeia: registradas[0].confirmada_na_cadeia,
    });
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

    if (!Number.isInteger(c.tentativas ?? 0) || (c.tentativas ?? 0) < 0)
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

    res.status(201).json({ notificados: seguradoras.length });
  });

  return r;
}
