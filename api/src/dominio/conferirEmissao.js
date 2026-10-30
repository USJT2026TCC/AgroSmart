import { ErroDaApi } from "../erros.js";
import { paraBytes32, resumirTermos } from "./termos.js";

/** O hash identifica o documento; cada campo executavel tambem precisa corresponder. */
export function conferirEmissao(proposta, contrato) {
  const p = proposta;
  const t = p.termos;
  const falhar = (campo) => {
    throw new ErroDaApi(
      400,
      "emissao_divergente",
      `Emissao recusada: ${campo} do contrato difere da proposta.`,
      { campo },
    );
  };
  if (!contrato || !t?.modoHistorico || contrato.modoHistorico !== true) falhar("modoHistorico");
  if (!["preparada", "emitida"].includes(p.situacao)) falhar("situacao");
  if (!p.descricao_dos_termos || resumirTermos(p.descricao_dos_termos) !== p.hash_termos)
    falhar("hashTermos");
  const esperado = {
    produtor: p.carteira_produtor,
    cultura: paraBytes32(p.talhao_cultura),
    talhao: paraBytes32(p.talhao_identificador),
    hashTermos: p.hash_termos,
    valorIndenizacao: String(p.valor_indenizacao_wei),
    limiarClimatico: Number(t.limiarClimatico),
    vigenciaInicio: Date.parse(`${t.inicioHistorico}T00:00:00Z`) / 1000,
    vigenciaFim: Date.parse(`${t.fimHistorico}T23:59:59Z`) / 1000,
  };
  for (const [campo, valor] of Object.entries(esperado)) {
    const atual = contrato[campo];
    if (typeof valor === "number") {
      if (
        !Number.isSafeInteger(valor) ||
        atual === null ||
        atual === undefined ||
        Number(atual) !== valor
      )
        falhar(campo);
    } else if (String(atual).toLowerCase() !== valor.toLowerCase()) falhar(campo);
  }
}
