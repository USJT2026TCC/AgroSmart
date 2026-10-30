import { Link } from "react-router-dom";

import { PERFIS } from "../sessao/perfis";

/**
 * Passo a passo da demonstracao, aberto pelo botao de ajuda do cabecalho.
 *
 * Cada perfil ve o caminho do seu lado. O oraculo aparece como etapa do fluxo,
 * e nao como aba: na demonstracao ele ja vem autorizado e ninguem precisa mexer.
 */
const PASSOS = {
  [PERFIS.SEGURADORA]: [
    <>
      Em <Link to="/seguradora/talhoes">Talhões</Link>, cadastre o talhão do João. O produto de soja
      em São Simão/SP já vem configurado.
    </>,
    <>O João escolhe período e gatilho e envia a proposta.</>,
    <>
      Em <Link to="/seguradora/propostas">Propostas</Link>, aprove: a MetaMask da seguradora cria a
      apólice na Sepolia. Em seguida, deposite a garantia.
    </>,
    <>
      O oráculo lê a chuva do INMET e informa ao contrato quantos dias secos houve. Só o endereço
      autorizado pode fazer isso. A situação dele aparece no <Link to="/seguradora">Painel</Link>.
    </>,
    <>
      Se o gatilho for atingido, o contrato paga o João sozinho. Se não, a garantia pode ser
      resgatada no fim da cobertura.
    </>,
  ],
  [PERFIS.PRODUTOR]: [
    <>
      Em <Link to="/produtor/carteira">Minha carteira</Link>, vincule sua conta da MetaMask. É para
      ela que vai a indenização; use uma conta diferente da seguradora.
    </>,
    <>
      Em <Link to="/produtor/cotacao">Simular e contratar</Link>, escolha talhão, período e gatilho
      e envie a proposta.
    </>,
    <>A seguradora aprova, cria a apólice e deposita a garantia.</>,
    <>O oráculo informa ao contrato os dias secos registrados pelo INMET.</>,
    <>Se o gatilho for atingido, a indenização chega à sua carteira, sem nova assinatura.</>,
  ],
};

export default function ComoFunciona({ perfil, fechar }) {
  const passos = PASSOS[perfil] ?? [];

  return (
    <section className="como-funciona" aria-label="Como funciona">
      <div className="entre">
        <h2>Como funciona</h2>
        <button className="secundario pequeno" onClick={fechar}>
          Fechar
        </button>
      </div>
      <ol>
        {passos.map((passo, i) => (
          <li key={i} onClick={(e) => e.target.closest("a") && fechar()}>
            {passo}
          </li>
        ))}
      </ol>
      <p className="silencioso">
        Demonstração com dados históricos reais do INMET (estação A770) e ETH de teste da Sepolia.
      </p>
    </section>
  );
}
