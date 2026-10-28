import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useSessao } from "../sessao/SessaoContexto";
import { destinoAposEntrar } from "../sessao/perfis";
import { Aviso, Campo } from "../componentes/ui";
import { enderecosDaRede, redeAtiva } from "../cadeia/rede";

/** Login (HU13) dos dois perfis fixos da demonstracao. */
export default function Entrar() {
  const { entrar, autenticado, perfil } = useSessao();
  const navegar = useNavigate();
  const local = useLocation();

  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const rede = redeAtiva();
  const enderecos = enderecosDaRede();
  const destino = local.state?.de ?? "/";

  if (autenticado) return <Navigate to={destinoAposEntrar(destino, perfil)} replace />;

  async function enviarSenha(evento) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const usuario = await entrar(identificador, senha);
      navegar(destinoAposEntrar(destino, usuario.perfil), { replace: true });
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina" style={{ maxWidth: 560 }}>
      <h1>AgroSmart</h1>
      <p className="silencioso">
        Seguro agrícola contra estiagem, com pagamento automático por contrato inteligente.
      </p>

      {!enderecos ? (
        <Aviso tipo="alerta" titulo="Nenhum contrato implantado nesta rede.">
          O aplicativo aponta para <strong>{rede.nome}</strong>, mas nao encontrou enderecos
          implantados. Consulte o responsável pela implantação para conferir a configuração.
        </Aviso>
      ) : null}

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <form className="cartao" onSubmit={enviarSenha}>
        <h2>Entrar</h2>

        <Campo
          rotulo="Identificador"
          htmlFor="identificador"
          ajuda="Perfis fixos: produtor (João Ribeiro) ou seguradora (Marina Costa)."
        >
          <input
            id="identificador"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </Campo>

        <Campo rotulo="Senha" htmlFor="senha">
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
          />
        </Campo>

        <button type="submit" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
