import { ESCOPO, talhaoNoEscopo } from "../../../../configuracao/escopo.js";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/cliente";
import { useAtualizacaoAutomatica } from "../../api/atualizacaoAutomatica";
import { useSessao } from "../../sessao/SessaoContexto";
import { emData, emEth, periodoEmData } from "../../cadeia/formatos";
import { Aviso, Carregando, LinkDaCadeia, Selo, SeloSituacao } from "../../componentes/ui";

const SITUACAO_DA_PROPOSTA = {
  pendente: ["alerta", "Em análise pela seguradora"],
  preparada: ["alerta", "Aguardando emissão"],
  recusada: ["erro", "Recusada"],
};

/**
 * Talhoes, propostas e apolices do produtor (UC06).
 *
 * A lista vem do backend, que o indexador mantem em dia com a cadeia. Isso
 * dispensa a carteira conectada so para ver o que se tem. O detalhe de cada
 * apolice continua lendo o contrato direto — la, a fonte e a propria rede.
 */
export default function MinhasApolices() {
  const { usuario } = useSessao();

  const [apolices, setApolices] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [talhoes, setTalhoes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);

    try {
      const [a, p, t, produtosAtivos] = await Promise.all([
        api("/apolices"),
        api("/propostas"),
        api("/talhoes"),
        api("/produtos"),
      ]);
      setTalhoes(t.talhoes);
      setProdutos(
        produtosAtivos.produtos.filter((x) => x.ativo !== false && x.cultura === ESCOPO.cultura),
      );
      setApolices(a.apolices);
      setPropostas(p.propostas.filter((x) => x.situacao !== "emitida"));
    } catch (falha) {
      setErro(falha.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useAtualizacaoAutomatica(carregar);

  const emAnalise = new Set(
    propostas
      .filter((p) => p.situacao === "pendente" || p.situacao === "preparada")
      .map((p) => p.talhao?.id),
  );
  const primeiroAcesso = apolices !== null && apolices.length === 0 && propostas.length === 0;

  return (
    <div className="pagina">
      <h1>Meus talhões e seguros</h1>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {!usuario?.carteira ? (
        <Aviso tipo="alerta" titulo="Falta vincular sua carteira.">
          A indenização é transferida para ela.{" "}
          <Link to="/produtor/carteira">Vincular carteira</Link>
        </Aviso>
      ) : null}

      {primeiroAcesso ? (
        <ol className="passos-curtos" aria-label="Como funciona">
          <li>
            <strong>Solicite</strong> uma proposta para um talhão.
          </li>
          <li>
            <strong>A seguradora aprova</strong> e deposita a garantia na Sepolia.
          </li>
          <li>
            <strong>Se o gatilho for atingido</strong>, a indenização chega à sua carteira sozinha.
          </li>
        </ol>
      ) : null}

      {apolices === null ? (
        erro ? (
          <button className="secundario" onClick={carregar}>
            Tentar novamente
          </button>
        ) : (
          <Carregando>Carregando seus cadastros…</Carregando>
        )
      ) : (
        <>
          <section className="cartao tabela-rolavel">
            <h2>Meus talhões</h2>
            {talhoes.length === 0 ? (
              <p>
                Nenhum talhão no seu cadastro ainda. A seguradora cadastra os talhões para você.
              </p>
            ) : (
              <table className="tabela-empilhada">
                <thead>
                  <tr>
                    <th>Talhão</th>
                    <th>Propriedade</th>
                    <th>Cultura</th>
                    <th>Área informada</th>
                    <th>Próximo passo</th>
                  </tr>
                </thead>
                <tbody>
                  {talhoes.map((t) => (
                    <tr key={t.id}>
                      <td data-rotulo="Talhão">{t.identificador}</td>
                      <td data-rotulo="Propriedade">{t.propriedade.nome}</td>
                      <td data-rotulo="Cultura">{t.cultura}</td>
                      <td data-rotulo="Área informada">
                        {Number(t.areaHa).toLocaleString("pt-BR")} ha
                      </td>
                      <td data-rotulo="Próximo passo">
                        {emAnalise.has(t.id) ? (
                          <Selo tipo="alerta">Proposta em análise</Selo>
                        ) : talhaoNoEscopo(t) && produtos.some((p) => p.cultura === t.cultura) ? (
                          <Link
                            className="botao-link"
                            aria-label={`Solicitar proposta para ${t.identificador}`}
                            to={`/produtor/cotacao?talhao=${encodeURIComponent(t.id)}`}
                          >
                            Solicitar proposta
                          </Link>
                        ) : (
                          <span className="silencioso">Fora do escopo da demonstração</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {propostas.length > 0 ? (
            <section className="cartao tabela-rolavel">
              <h2>Propostas</h2>
              <table className="tabela-empilhada">
                <thead>
                  <tr>
                    <th>Talhão</th>
                    <th>Enviada em</th>
                    <th>Gatilho</th>
                    <th className="numero">Indenização</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {propostas.map((p) => {
                    const [tipo, rotulo] = SITUACAO_DA_PROPOSTA[p.situacao] ?? [
                      "neutro",
                      p.situacao,
                    ];
                    return (
                      <tr key={p.id}>
                        <td data-rotulo="Talhão">{p.talhao.identificador}</td>
                        <td data-rotulo="Enviada em">
                          {p.criadaEm ? new Date(p.criadaEm).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td data-rotulo="Gatilho">
                          {p.termos ? `${p.termos.limiarClimatico} dias secos` : "—"}
                        </td>
                        <td data-rotulo="Indenização" className="numero">
                          {emEth(p.valorIndenizacaoWei)}
                        </td>
                        <td data-rotulo="Situação">
                          <Selo tipo={tipo}>{rotulo}</Selo>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="cartao tabela-rolavel">
            <h2>Apólices</h2>
            {apolices.length === 0 ? (
              <p className="silencioso">
                Nenhuma apólice ainda. Ela aparece aqui quando a seguradora aprovar uma proposta.
              </p>
            ) : (
              <table className="tabela-empilhada">
                <thead>
                  <tr>
                    <th>Talhão</th>
                    <th>Emitida em</th>
                    <th className="numero">Indenização</th>
                    <th>Situação</th>
                    <th>Contrato</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {apolices.map((a) => (
                    <tr key={a.endereco}>
                      <td data-rotulo="Talhão">{a.talhao ?? "—"}</td>
                      <td data-rotulo="Emitida em">
                        {emData(new Date(a.emitidaEm).getTime() / 1000)}
                      </td>
                      <td data-rotulo="Indenização" className="numero">
                        {emEth(a.valorIndenizacaoWei)}
                      </td>
                      <td data-rotulo="Situação">
                        <SeloSituacao situacao={a.situacao} />
                        {a.situacao === 2 ? (
                          <div className="silencioso">
                            Recebeu {emEth(a.valorPagoWei)}
                            {a.periodoAcionador ? ` em ${periodoEmData(a.periodoAcionador)}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td data-rotulo="Contrato">
                        <LinkDaCadeia valor={a.endereco} tipo="address" />
                      </td>
                      <td data-rotulo="">
                        <Link to={`/apolice/${a.endereco}`}>Ver detalhes</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
