/** Recorte fixo da demonstracao; nao representa validacao agronomica. */
export const ESCOPO = Object.freeze({
  produtor: "produtor",
  seguradora: "seguradora",
  cultura: "soja",
  municipio: "São Simão/SP",
  localidade: "São Simão/SP (estação INMET A770)",
});

export function municipioNoEscopo(valor) {
  return (
    typeof valor === "string" &&
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase() === "sao simao/sp"
  );
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
