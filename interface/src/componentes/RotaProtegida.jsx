import { Navigate, useLocation } from "react-router-dom";

import { useSessao } from "../sessao/SessaoContexto";
import { Carregando } from "./ui";

/** Restringe a navegacao por sessao e perfil. A API e os contratos verificam as permissoes independentemente. */
export default function RotaProtegida({ perfis, children }) {
  const { autenticado, perfil, carregando } = useSessao();
  const local = useLocation();

  if (carregando) return <Carregando>Verificando a sessao…</Carregando>;

  if (!autenticado) {
    // Guarda o destino para voltar a ele depois do login.
    return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  }

  if (perfis && !perfis.includes(perfil)) {
    return <Navigate to="/sem-acesso" replace />;
  }

  return children;
}
