import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/cliente";
import { emEth, emPercentual } from "../../cadeia/formatos";
import { implantacaoDaRede } from "../../cadeia/rede";
import {
  Aviso,
  Campo,
  Carregando,
  Indicador,
  LinkDaCadeia,
  SeloSituacao,
} from "../../componentes/ui";

const SEM_FILTROS = { de: "", ate: "", cultura: "", regiao: "" };

/** Visao operacional: propostas, garantias e pagamentos; detalhes sob demanda. */
export default function CarteiraDaSeguradora() {
  const [dados, setDados] = useState(null);
  const [filtros, setFiltros] = useState(SEM_FILTROS);
  const [rascunho, setRascunho] = useState(SEM_FILTROS);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const consultaAtual = useRef(0);
  const implantacao = implantacaoDaRede();

  const carregar = useCallback(async () => {
    const consultaId = ++consultaAtual.current;
    setAtualizando(true);
    setErro(null);
    const consulta = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    const sufixo = consulta ? `?${consulta}` : "";
    try {
      const [relatorio, lista, saude] = await Promise.all([
        api(`/relatorios/carteira${sufixo}`),
        api(`/apolices${sufixo}`),
        api("/saude"),
      ]);
      if (consultaId !== consultaAtual.current) return;
      setDados({ relatorio, apolices: lista.apolices, saude, filtros });
    } catch (falha) {
      if (consultaId === consultaAtual.current) setErro(falha.message);
    } finally {
      if (consultaId === consultaAtual.current) setAtualizando(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregar();
    return () => {
      consultaAtual.current++;
    };
  }, [carregar]);

  const limpar = () => {
    setRascunho(SEM_FILTROS);
    setFiltros(SEM_FILTROS);
  };
  const mudar = (campo) => (e) => setRascunho((r) => ({ ...r, [campo]: e.target.value }));
  function aplicar(e) {
    e.preventDefault();
    if (rascunho.de && rascunho.ate && rascunho.de > rascunho.ate) {
      setErro("A data inicial deve ser anterior ou igual à final.");
      return;
    }
    setFiltros({ ...rascunho });
  }
  const r = dados?.relatorio;
  const c = r?.carteira;
  const saude = dados?.saude;
  const filtrando = Object.values(dados?.filtros ?? {}).some(Boolean);
  const indexador = saude?.indexador;
  const semSincronizacao = !indexador?.ativo || Boolean(indexador?.ultimoErro);
  const pendentes = r?.propostasPendentes ?? 0;
  const temApolices = (c?.apolices ?? 0) > 0;

  return (
    <div className="pagina painel-carteira">
      <header className="painel-titulo">
        <div>
          <p className="painel-sobre">PAINEL DA SEGURADORA</p>
          <h1>Visão geral dos seguros</h1>
          <p className="silencioso">
            Acompanhe propostas, coberturas e indenizações em um só lugar.
          </p>
        </div>
        <button className="secundario" onClick={carregar} disabled={atualizando}>
          {atualizando ? "Atualizando…" : "Atualizar dados"}
        </button>
      </header>
      {erro && (
        <Aviso tipo="erro" titulo="Não foi possível atualizar o painel.">
          {erro}
          {dados && <p>Os dados exibidos são da última consulta concluída.</p>}
        </Aviso>
      )}
      {!dados ? (
        !erro && <Carregando>Carregando seus seguros…</Carregando>
      ) : (
        <>
          <div className="painel-rede">
            <span
              className={`painel-ponto ${semSincronizacao ? "atencao" : ""}`}
              aria-hidden="true"
            />
            <span>
              {semSincronizacao
                ? "Sincronização com a Sepolia indisponível"
                : "Sincronização com a Sepolia ativa"}
            </span>
            <span className="silencioso">Valores em ETH de teste</span>
          </div>
          {semSincronizacao && (
            <Aviso tipo="alerta">
              A consulta à blockchain está com uma interrupção. As apólices e os pagamentos exibidos
              podem estar desatualizados.
              <details>
                <summary>Detalhes da conexão</summary>
                <p>
                  {indexador?.ultimoErro?.mensagem || "O serviço de sincronização não está ativo."}
                </p>
              </details>
            </Aviso>
          )}

          {pendentes > 0 && (
            <section className="painel-pendencias" aria-label="Propostas aguardando emissão">
              <div>
                <span className="painel-contagem">{pendentes}</span>
                <div>
                  <h2>
                    {pendentes === 1
                      ? "Proposta aguardando emissão"
                      : "Propostas aguardando emissão"}
                  </h2>
                  <p>Confira as solicitações para emitir as apólices.</p>
                </div>
              </div>
              <Link className="acao-painel" to="/seguradora/propostas">
                Analisar propostas →
              </Link>
            </section>
          )}

          {(temApolices || filtrando) && (
            <details className="cartao painel-filtros" open={filtrando || undefined}>
              <summary>Filtrar apólices {filtrando ? "· filtros aplicados" : ""}</summary>
              <form onSubmit={aplicar}>
                <p className="silencioso">
                  As datas abaixo são de emissão na blockchain, não da cobertura climática
                  histórica.
                </p>
                <div className="grade">
                  <Campo rotulo="Emissão a partir de" htmlFor="filtro-de">
                    <input
                      id="filtro-de"
                      type="date"
                      value={rascunho.de}
                      max={rascunho.ate || undefined}
                      onChange={mudar("de")}
                    />
                  </Campo>
                  <Campo rotulo="Emissão até" htmlFor="filtro-ate">
                    <input
                      id="filtro-ate"
                      type="date"
                      value={rascunho.ate}
                      min={rascunho.de || undefined}
                      onChange={mudar("ate")}
                    />
                  </Campo>
                  <Campo rotulo="Cultura" htmlFor="filtro-cultura">
                    <select
                      id="filtro-cultura"
                      value={rascunho.cultura}
                      onChange={mudar("cultura")}
                    >
                      <option value="">Todas as culturas</option>
                      {(r.opcoesDeFiltro?.culturas ?? []).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Município cadastrado" htmlFor="filtro-regiao">
                    <select id="filtro-regiao" value={rascunho.regiao} onChange={mudar("regiao")}>
                      <option value="">Todos os municípios</option>
                      {(r.opcoesDeFiltro?.regioes ?? []).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
                <div className="linha-de-botoes">
                  <button disabled={atualizando}>Aplicar filtros</button>
                  <button
                    type="button"
                    className="secundario"
                    disabled={atualizando}
                    onClick={limpar}
                  >
                    Limpar filtros
                  </button>
                </div>
              </form>
            </details>
          )}

          {temApolices ? (
            <>
              <div className="painel-indicadores">
                <Indicador
                  rotulo="Apólices emitidas"
                  valor={c.apolices}
                  nota={`${c.ativas} ativas · ${c.aguardando_garantia} aguardando garantia`}
                />
                <Indicador
                  rotulo="Cobertura contratada"
                  valor={emEth(c.limite_total_wei)}
                  nota="Soma das indenizações contratadas"
                />
                <Indicador
                  rotulo="Indenizações pagas"
                  valor={emEth(c.pago_total_wei)}
                  nota={`${c.liquidadas} apólice(s) com pagamento`}
                />
              </div>
              {c.aguardando_garantia > 0 && (
                <Aviso tipo="alerta">
                  {c.aguardando_garantia} apólice(s) aguardam depósito da garantia. Abra os detalhes
                  da apólice para depositar.
                </Aviso>
              )}
              <section
                className="cartao tabela-rolavel painel-apolices"
                aria-label="Apólices emitidas"
              >
                <h2>{filtrando ? "Apólices encontradas" : "Suas apólices"}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Produtor / talhão</th>
                      <th>Emissão (UTC)</th>
                      <th>Indenização contratada</th>
                      <th>Valor pago</th>
                      <th>Situação</th>
                      <th>
                        <span className="silencioso">Ação</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.apolices.map((a) => (
                      <tr key={a.endereco}>
                        <td>
                          <strong>{a.produtor.nome || "Produtor sem nome cadastrado"}</strong>
                          <div className="silencioso">
                            {a.talhao || "Talhão não identificado"}
                            {a.cultura ? ` · ${a.cultura}` : ""}
                          </div>
                        </td>
                        <td>
                          {new Date(a.emitidaEm).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                        </td>
                        <td>{emEth(a.valorIndenizacaoWei)}</td>
                        <td>{emEth(a.valorPagoWei)}</td>
                        <td>
                          <SeloSituacao situacao={a.situacao} />
                        </td>
                        <td>
                          <Link
                            className="painel-link"
                            to={`/apolice/${a.endereco}`}
                            aria-label={`Abrir apólice ${a.talhao || a.endereco}`}
                          >
                            Abrir apólice →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <details className="cartao painel-detalhes">
                <summary>Relatório por cultura e município</summary>
                <p className="silencioso">
                  {c.canceladas} cancelada(s) · {c.encerradas} encerrada(s) ·{" "}
                  {emPercentual(Math.round(c.taxaDeAcionamento * 10000))} das apólices com
                  indenização paga.
                </p>
                <div className="grade-2">
                  {[
                    ["Por cultura", r.porCultura, "cultura"],
                    ["Por município", r.porRegiao, "regiao"],
                  ].map(([titulo, linhas, chave]) => (
                    <section className="tabela-rolavel" key={chave}>
                      <h3>{titulo}</h3>
                      <table>
                        <thead>
                          <tr>
                            <th>{chave === "cultura" ? "Cultura" : "Município"}</th>
                            <th>Apólices</th>
                            <th>Pagas</th>
                            <th>Valor pago</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((l) => (
                            <tr key={l[chave]}>
                              <td>{l[chave]}</td>
                              <td>{l.apolices}</td>
                              <td>{l.liquidadas}</td>
                              <td>{emEth(l.pago_total_wei)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <section className="cartao painel-vazio">
              <span className="painel-vazio-simbolo" aria-hidden="true">
                ◇
              </span>
              <h2>
                {filtrando
                  ? "Nenhuma apólice corresponde aos filtros"
                  : "Sua primeira apólice começa com uma proposta"}
              </h2>
              <p>
                {filtrando
                  ? "Ajuste os filtros para consultar outros seguros."
                  : "Você ainda não tem apólices emitidas. Veja o caminho para começar:"}
              </p>
              {filtrando ? (
                <button className="secundario" onClick={limpar}>
                  Limpar filtros
                </button>
              ) : (
                <>
                  <ol className="painel-primeiros-passos">
                    <li>
                      <span>1</span>
                      <strong>Cadastre</strong>
                      <p>Produtor, talhão, cultura e produto de seguro.</p>
                    </li>
                    <li>
                      <span>2</span>
                      <strong>Receba a proposta</strong>
                      <p>O produtor escolhe a cobertura histórica e envia a solicitação.</p>
                    </li>
                    <li>
                      <span>3</span>
                      <strong>Emita e deposite</strong>
                      <p>A seguradora emite a apólice e deposita a garantia pela MetaMask.</p>
                    </li>
                  </ol>
                  <div className="linha-de-botoes">
                    <Link
                      className="acao-painel"
                      to={pendentes ? "/seguradora/propostas" : "/seguradora/talhoes"}
                    >
                      {pendentes ? "Ver propostas recebidas" : "Iniciar cadastro"} →
                    </Link>
                    {pendentes > 0 && <Link to="/seguradora/talhoes">Consultar cadastros</Link>}
                  </div>
                </>
              )}
            </section>
          )}

          <details className="painel-conexao">
            <summary>Detalhes da rede e dos contratos</summary>
            <p className="silencioso">
              Os contratos são executados na Sepolia. Os valores acima vêm dos eventos registrados
              pela API.
            </p>
            <dl>
              <dt>Fábrica de apólices</dt>
              <dd>
                <LinkDaCadeia valor={implantacao?.contratos.ApoliceFactory} tipo="address" />
              </dd>
              <dt>Registro de oráculos</dt>
              <dd>
                <LinkDaCadeia valor={implantacao?.contratos.OracleRegistry} tipo="address" />
              </dd>
            </dl>
            {r.publicacoes.total > 0 && (
              <p>
                {r.publicacoes.total} publicação(ões) confirmada(s). Latência média de envio até
                confirmação:{" "}
                {r.publicacoes.latencia_media_ms == null
                  ? "não disponível"
                  : `${r.publicacoes.latencia_media_ms} ms`}
                .
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
