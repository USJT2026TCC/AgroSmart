import { ESCOPO } from "../../../configuracao/escopo.js";
import { Aviso } from "./ui";

/** Faixa do produto fixo da demonstracao; condicoes reais recebidas da API. */
export default function ProdutoDemonstracao({ produtos }) {
  if (produtos.length === 0) {
    return (
      <Aviso tipo="alerta" titulo="Nenhum produto de soja ativo.">
        O cadastro de talhão depende do produto da demonstração, criado pela semente do banco.
      </Aviso>
    );
  }

  return produtos.map((p) => (
    <section className="faixa-produto" key={p.id}>
      <div>
        <strong>{p.nome}</strong>
        <div className="silencioso">{ESCOPO.localidade}</div>
      </div>
      <dl>
        <div>
          <dt>Indenização</dt>
          <dd>{p.valorIndenizacaoEth} ETH de teste</dd>
        </div>
        <div>
          <dt>Dados</dt>
          <dd>INMET, 2020 a set/2026</dd>
        </div>
      </dl>
      <span className="selo sucesso">Produto fixo da demonstração</span>
    </section>
  ));
}
