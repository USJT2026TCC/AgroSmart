import { pedidoInvalido } from "../erros.js";

/** Filtros do relatorio (RF29): periodo de emissao, cultura e regiao (municipio). */
export function filtrosDoRelatorio(q) {
  const data = (valor, campo) => {
    if (valor === undefined || valor === "") return null;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(String(valor)) ||
      !Number.isFinite(Date.parse(`${valor}T00:00:00Z`)) ||
      new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) !== valor
    ) {
      throw pedidoInvalido(`O filtro "${campo}" deve estar no formato AAAA-MM-DD.`);
    }
    return String(valor);
  };
  const textoOpcional = (valor) =>
    valor === undefined || valor === "" ? null : String(valor).slice(0, 120);

  const de = data(q.de, "de"),
    ate = data(q.ate, "ate");
  if (de && ate && de > ate)
    throw pedidoInvalido("A data inicial deve ser anterior ou igual a final.");
  return {
    de,
    ate,
    cultura: textoOpcional(q.cultura)?.toLowerCase() ?? null,
    regiao: textoOpcional(q.regiao),
  };
}
