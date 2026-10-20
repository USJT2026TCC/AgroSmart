import { Router } from "express";
import historico from "../../../oraculo/src/historico.js";
import { exigirSessao } from "../seguranca/sessoes.js";
import { pedidoInvalido } from "../erros.js";

/** Consulta historica nao movimenta garantia nem simula uma assinatura do INMET. */
export function rotasDoHistorico() {
  const r = Router();
  r.use("/historico", exigirSessao);
  r.get("/historico/disponibilidade", async (req, res) => {
    const { rows } = await req.app.locals.banco.query(
      `SELECT ano,procedencia,importado_em FROM inmet_arquivos WHERE estacao='A770' ORDER BY ano`,
    );
    res.json({
      estacao: "A770",
      localidade: "Sao Simao/SP",
      fonte: "INMET",
      anos: rows,
    });
  });
  r.post("/historico/avaliar", async (req, res) => {
    const { inicio, fim, gatilho } = req.body ?? {};
    try {
      historico.avaliarHistorico({ linhas: [], inicio, fim, gatilho });
    } catch {
      throw pedidoInvalido(
        "Informe datas validas e gatilho inteiro entre 1 e 366 dias.",
      );
    }
    const { rows } = await req.app.locals.banco.query(
      `SELECT data::text,chuva_mm,horas_validas FROM inmet_dias WHERE estacao='A770' AND data BETWEEN $1 AND $2 ORDER BY data`,
      [inicio, fim],
    );
    if (!rows.length)
      throw pedidoInvalido(
        "Nenhum dado importado para esse intervalo. Prepare a serie INMET primeiro.",
      );
    const resultado = historico.avaliarHistorico({
      linhas: rows,
      inicio,
      fim,
      gatilho,
    });
    res.json({
      resultado,
      aviso:
        "Contratacao hipotetica, talhao considerado coincidente com a estacao. Nao mede prejuizo agricola. Esta consulta nao envia transacao nem paga indenizacao.",
    });
  });
  return r;
}
