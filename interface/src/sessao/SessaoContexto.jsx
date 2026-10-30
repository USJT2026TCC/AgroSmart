import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, token } from "../api/cliente";

/** Sessao autenticada pela API; o navegador guarda o token, nunca a senha. */

const ContextoSessao = createContext(null);

export function ProvedorSessao({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const limpar = useCallback(() => {
    token.apagar();
    setUsuario(null);
  }, []);

  /** Confere o token guardado ao abrir o aplicativo. */
  useEffect(() => {
    if (!token.ler()) {
      setCarregando(false);
      return;
    }

    api("/autenticacao/eu")
      .then(({ usuario: u }) => setUsuario(u))
      .catch(() => limpar())
      .finally(() => setCarregando(false));
  }, [limpar]);

  /** Sessao expirada ou revogada no servidor: volta ao login. */
  useEffect(() => {
    const aoExpirar = () => limpar();
    window.addEventListener("agrosmart:sessao-expirada", aoExpirar);

    return () => window.removeEventListener("agrosmart:sessao-expirada", aoExpirar);
  }, [limpar]);

  const entrar = useCallback(async (identificador, senha) => {
    const resposta = await api("/autenticacao/entrar", {
      metodo: "POST",
      corpo: { identificador, senha },
    });

    token.gravar(resposta.token);
    setUsuario(resposta.usuario);
    return resposta.usuario;
  }, []);

  const sair = useCallback(async () => {
    // A revogacao no servidor e o que encerra a sessao de verdade. Se falhar
    // (servidor fora do ar), o token local e apagado de qualquer forma.
    try {
      await api("/autenticacao/sair", { metodo: "POST" });
    } catch {
      // segue para a limpeza local
    }
    limpar();
  }, [limpar]);

  /** Relê o usuario depois de uma mudanca, como vincular a carteira. */
  const recarregarUsuario = useCallback(async () => {
    const { usuario: u } = await api("/autenticacao/eu");
    setUsuario(u);
    return u;
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      carregando,
      autenticado: Boolean(usuario),
      perfil: usuario?.perfil ?? null,
      entrar,
      sair,
      recarregarUsuario,
    }),
    [usuario, carregando, entrar, sair, recarregarUsuario],
  );

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>;
}

export function useSessao() {
  const contexto = useContext(ContextoSessao);

  if (!contexto) throw new Error("useSessao precisa estar dentro de ProvedorSessao.");

  return contexto;
}
