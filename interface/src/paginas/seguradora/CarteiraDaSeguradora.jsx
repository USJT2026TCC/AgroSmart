import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/cliente";
import { useAtualizacaoAutomatica } from "../../api/atualizacaoAutomatica";
import { emEth, emPercentual } from "../../cadeia/formatos";
import ConexaoSepolia from "../../componentes/ConexaoSepolia";
import { Aviso, Carregando, Indicador, SeloSituacao } from "../../componentes/ui";

/** Visao operacional: propostas, garantias e pagamentos; detalhes sob demanda. */
export default function CarteiraDaSeguradora() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const consultaAtual = useRef(0);

  const carregar = useCallback(async () => {
    const consultaId = ++consultaAtual.current;
    setAtualizando(true);
    setErro(null);
    try {
      const [relatorio, lista, saude] = await Promise.all([
        api("/relatorios/carteira"),
        api("/apolices"),
        api("/saude"),
      ]);
      if (consultaId !== consultaAtual.current) return;
      setDados({ relatorio, apolices: lista.apolices, saude });
    } catch (falha) {
      if (consultaId === consultaAtual.current) setErro(falha.message);
    } finally {
      if (consultaId === consultaAtual.current) setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    return () => {
      consultaAtual.current++;
    };
  }, [carregar]);
  useAtualizacaoAutomatica(carregar);

  const r = dados?.relatorio;
  const c = r?.carteira;
  const saude = dados?.saude;
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
      </header>
      {erro && (
        <Aviso tipo="erro" titulo="Não foi possível atualizar o painel.">
          {erro}
          {dados && <p>Os dados exibidos são da última consulta concluída.</p>}
          <button className="secundario pequeno" onClick={carregar} disabled={atualizando}>
            {atualizando ? "Tentando…" : "Tentar novamente"}
          </button>
        </Aviso>
      )}
      {!dados ? (
        !erro && <Carregando>Carregando seus seguros…</Carregando>
      ) : (
        <>
          <ConexaoSepolia
            pendentes={pendentes}
            atualizacao={dados}
            semSincronizacao={semSincronizacao}
            publicacoes={r.publicacoes}
          />
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
              <p className="silencioso">
                {c.canceladas} cancelada(s) · {c.encerradas} encerrada(s) ·{" "}
                {emPercentual(Math.round(c.taxaDeAcionamento * 10000))} das apólices com indenização
                paga.
              </p>
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
                <h2>Suas apólices</h2>
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
            </>
          ) : (
            <section className="cartao painel-vazio">
              <span className="painel-vazio-simbolo" aria-hidden="true">
                ◇
              </span>
              <h2>Sua primeira apólice começa com uma proposta</h2>
              <p>Você ainda não tem apólices emitidas. Veja o caminho para começar:</p>
              <>
                <ol className="painel-primeiros-passos">
                  <li>
                    <span>1</span>
                    <strong>Cadastre o talhão</strong>
                    <p>O produto de soja e o produtor João já vêm prontos.</p>
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
                    {pendentes ? "Ver propostas recebidas" : "Cadastrar talhão"} →
                  </Link>
                  {pendentes > 0 && <Link to="/seguradora/talhoes">Ver talhões</Link>}
                </div>
              </>
            </section>
          )}
        </>
      )}
    </div>
  );
}
