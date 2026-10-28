import { useSessao } from "../sessao/SessaoContexto";
import { ROTULOS_DE_PERFIL } from "../sessao/perfis";
import { Campo } from "../componentes/ui";

/** Dados do perfil fixo da demonstracao: nome, perfil e identificador. */
export default function Conta() {
  const { usuario } = useSessao();

  return (
    <div className="pagina" style={{ maxWidth: 680 }}>
      <h1>Minha conta</h1>

      <div className="cartao">
        <Campo rotulo="Nome">{usuario?.nome}</Campo>
        <Campo rotulo="Perfil">{ROTULOS_DE_PERFIL[usuario?.perfil]}</Campo>
        <Campo rotulo="Identificador">{usuario?.identificador}</Campo>
      </div>
    </div>
  );
}
