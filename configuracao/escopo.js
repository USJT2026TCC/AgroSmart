import limites from "./historico.json" with { type: "json" };

/** Recorte fixo da demonstracao; nao representa validacao agronomica. */
const MUNICIPIO = "São Simão/SP";
export const ESCOPO = Object.freeze({
  produtor: "produtor",
  seguradora: "seguradora",
  cultura: "soja",
  municipio: MUNICIPIO,
  localidade: `${MUNICIPIO} (estação INMET ${limites.estacao})`,
});

const normalizarMunicipio = (valor) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const MUNICIPIO_NORMALIZADO = normalizarMunicipio(ESCOPO.municipio);

/** Aceita variacoes de acento e caixa do mesmo municipio, preservando a UF. */
export function municipioNoEscopo(valor) {
  return typeof valor === "string" && normalizarMunicipio(valor) === MUNICIPIO_NORMALIZADO;
}

export function talhaoNoEscopo(talhao) {
  return talhao?.cultura === ESCOPO.cultura && municipioNoEscopo(talhao.propriedade?.municipio);
}

/** Somente as duas contas da demonstração podem iniciar ou manter sessão. */
export function usuarioNoEscopo(usuario) {
  return Boolean(
    usuario &&
    ((usuario.perfil === "produtor" && usuario.identificador === ESCOPO.produtor) ||
      (usuario.perfil === "seguradora" && usuario.identificador === ESCOPO.seguradora)),
  );
}
