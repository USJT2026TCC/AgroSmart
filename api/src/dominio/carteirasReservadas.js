import { lerImplantacao } from "../config.js";

/**
 * Carteiras com papel proprio no manifesto, que nao podem ser do produtor.
 *
 * A validação impede usar a conta da seguradora ou do oráculo como beneficiária.
 *
 * @returns {string|null} O papel da carteira ("da seguradora", "do oraculo") ou nulo.
 */
export function carteiraReservada(endereco) {
  const implantacao = lerImplantacao();
  const alvo = String(endereco ?? "").toLowerCase();

  if (!implantacao || !alvo) return null;
  if (implantacao.seguradora?.toLowerCase() === alvo) return "da seguradora";
  if (implantacao.oraculoAutorizado?.toLowerCase() === alvo) return "do oraculo";

  return null;
}
