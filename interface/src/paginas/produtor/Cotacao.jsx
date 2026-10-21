import limites from "../../../../configuracao/historico.json";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/cliente";
import { useSessao } from "../../sessao/SessaoContexto";
import { exemplosDeAcionamento, condicaoEmPalavras } from "../../cadeia/regraDeGatilho";
import { emEth, emPercentual } from "../../cadeia/formatos";
import { Aviso, Campo, Carregando, RodapeDaFronteira } from "../../componentes/ui";

/**
 * Simulacao de cotacao e envio da proposta (RF06, RNF04, HU10).
 *
 * O limite e o premio vem do servidor, calculados em BigInt sobre a area cadastrada. Os exemplos numericos do que aciona e do que nao
 * aciona vem de `regraDeGatilho.js`, a mesma regra do contrato — a equivalencia e
 * verificada caso a caso por `testes/blockchain/unitarios/RegraDeGatilho.test.js`.
 */
export default function Cotacao() {
  const { usuario } = useSessao();

  const [talhoes, setTalhoes] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [talhaoId, setTalhaoId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [areaSegurada, setAreaSegurada] = useState("");
  const [inicioDaVigencia, setInicioDaVigencia] = useState("2024-02-07");
  const reproducaoHistorica = true;
  const [fimDaVigencia, setFimDaVigencia] = useState("2025-02-07");
  const [gatilhoDias, setGatilhoDias] = useState(30);
  const [avaliacaoHistorica, setAvaliacaoHistorica] = useState(null);
  const [cotacao, setCotacao] = useState(null);
  const [enviada, setEnviada] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    Promise.all([api("/talhoes"), api("/produtos")])
      .then(([t, p]) => {
        setTalhoes(t.talhoes);
        setProdutos(p.produtos);

        if (t.talhoes[0]) {
          setTalhaoId(t.talhoes[0].id);
          setAreaSegurada(String(Number(t.talhoes[0].areaHa).toFixed(2)));
        }
      })
      .catch((falha) => setErro(falha.message));
  }, []);

  const talhao = talhoes?.find((t) => t.id === talhaoId) ?? null;

  // So faz sentido oferecer produtos da cultura plantada no talhao.
  const produtosCompativeis = useMemo(
    () => produtos.filter((p) => !talhao || p.cultura === talhao.cultura),
    [produtos, talhao],
  );

  const produto = produtosCompativeis.find((p) => p.id === produtoId) ?? null;

  /** Recalcula a cotacao no servidor a cada mudanca de talhao, produto, area ou inicio. */
  useEffect(() => {
    setCotacao(null);
    if (!talhaoId || !produtoId || !areaSegurada) return undefined;

    const temporizador = setTimeout(() => {
      api("/cotacoes", {
        metodo: "POST",
        corpo: {
          talhaoId,
          produtoId,
          areaHa: areaSegurada,
          inicioDaVigencia,
          reproducaoHistorica,
          fimDaVigencia,
          gatilhoDias,
        },
      })
        .then(({ cotacao: c }) => {
          setCotacao(c);
          setErro(null);
        })
        .catch((falha) => setErro(falha.message));
    }, 250);

    return () => clearTimeout(temporizador);
  }, [
    talhaoId,
    produtoId,
    areaSegurada,
    inicioDaVigencia,
    reproducaoHistorica,
    fimDaVigencia,
    gatilhoDias,
  ]);

  /** Termos no formato da regra de gatilho, com o limite cotado pelo servidor. */
  const termos = useMemo(
    () => (cotacao ? { ...cotacao.termos, valorIndenizacao: cotacao.valorIndenizacaoWei } : null),
    [cotacao],
  );

  const exemplos = useMemo(() => (termos ? exemplosDeAcionamento(termos) : []), [termos]);

  /** A condicao em linguagem corrente (RNF04). */
  const textoDaCondicao = useMemo(
    () => (produto ? condicaoEmPalavras(cotacao?.termos ?? produto) : null),
    [produto, cotacao],
  );

  async function enviarProposta() {
    setErro(null);
    setEnviando(true);

    try {
      const { proposta } = await api("/propostas", {
        metodo: "POST",
        corpo: {
          talhaoId,
          produtoId,
          areaHa: areaSegurada,
          inicioDaVigencia,
          reproducaoHistorica,
          fimDaVigencia,
          gatilhoDias,
        },
      });
      setEnviada(proposta);
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  if (talhoes === null) {
    return (
      <div className="pagina">
        <h1>Simular e contratar</h1>
        {erro ? (
          <Aviso tipo="erro">{erro}</Aviso>
        ) : (
          <Carregando>Carregando seus talhoes…</Carregando>
        )}
      </div>
    );
  }

  if (talhoes.length === 0) {
    return (
      <div className="pagina">
        <h1>Simular e contratar</h1>
        <Aviso tipo="alerta" titulo="Nenhum talhao cadastrado.">
          A seguradora precisa cadastrar o produtor e delimitar os talhoes seguraveis antes da
          cotacao (UC02).
        </Aviso>
      </div>
    );
  }

  return (
    <div className="pagina">
      <h1>Simular e contratar</h1>
      <p className="silencioso">
        A cotacao mostra o limite, o premio e exatamente o que aciona e o que nao aciona o
        pagamento.
      </p>

      {!usuario?.carteira ? (
        <Aviso tipo="alerta" titulo="Carteira nao vinculada.">
          Voce pode simular, mas para enviar a proposta e preciso{" "}
          <Link to="/produtor/carteira">vincular a carteira</Link> — e para ela que a indenizacao
          seria transferida.
        </Aviso>
      ) : null}

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {enviada ? (
        <Aviso tipo="sucesso" titulo="Proposta enviada a seguradora.">
          A seguradora precisa emitir a apolice, porque so a carteira dela pode implantar o contrato
          na rede (RNF10). Voce recebera uma notificacao quando a apolice for emitida.
        </Aviso>
      ) : null}

      <div className="grade-2">
        <div className="cartao">
          <h2>1. O que segurar</h2>

          <Campo rotulo="Talhao" htmlFor="talhao">
            <select
              id="talhao"
              value={talhaoId}
              onChange={(e) => {
                const escolhido = talhoes.find((t) => t.id === e.target.value);
                setTalhaoId(e.target.value);
                setAreaSegurada(String(Number(escolhido?.areaHa ?? 0).toFixed(2)));
                setProdutoId("");
              }}
            >
              {talhoes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.identificador} — {t.propriedade.nome} ({t.cultura},{" "}
                  {Number(t.areaHa).toFixed(1)} ha)
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            rotulo="Area segurada (ha)"
            htmlFor="area"
            ajuda={
              talhao
                ? `O talhao tem ${Number(talhao.areaHa).toFixed(2)} ha, de área ${talhao.origemArea === "informada" ? "informada pela seguradora" : "medida por polígono"}.`
                : null
            }
          >
            <input
              id="area"
              type="number"
              min="0.01"
              step="0.01"
              max={talhao?.areaHa ?? undefined}
              value={areaSegurada}
              onChange={(e) => setAreaSegurada(e.target.value)}
            />
          </Campo>

          <Campo
            rotulo="Inicio da cobertura"
            htmlFor="inicio"
            ajuda="Data original dos dados INMET. Contagem comeca neste dia, em UTC."
          >
            <input
              id="inicio"
              type="date"
              min={limites.inicio}
              max={limites.fim}
              value={inicioDaVigencia}
              onChange={(e) => {
                setInicioDaVigencia(e.target.value);
                setAvaliacaoHistorica(null);
              }}
            />
          </Campo>

          <p>Dados historicos do INMET: Sao Simao/SP (A770).</p>
          {reproducaoHistorica ? (
            <>
              <Aviso tipo="alerta">
                Contratacao hipotetica. Talhao considerado coincidente com a estacao por hipotese.
                Dados reais do INMET; eventual pagamento de teste ocorre no momento da transacao,
                apos a implantacao da fabrica historica. Gatilho experimental, sem estimativa de
                prejuizo agricola.
              </Aviso>
              <Campo rotulo="Fim da cobertura historica" htmlFor="fim-historico">
                <input
                  id="fim-historico"
                  type="date"
                  max={limites.fim}
                  value={fimDaVigencia}
                  onChange={(e) => {
                    setFimDaVigencia(e.target.value);
                    setAvaliacaoHistorica(null);
                  }}
                />
              </Campo>
              <Campo rotulo="Gatilho experimental (dias secos)" htmlFor="gatilho-dias">
                <input
                  id="gatilho-dias"
                  type="number"
                  min="1"
                  max="366"
                  value={gatilhoDias}
                  onChange={(e) => {
                    setGatilhoDias(Number(e.target.value));
                    setAvaliacaoHistorica(null);
                  }}
                />
              </Campo>
              <button
                type="button"
                className="secundario"
                onClick={async () => {
                  setErro(null);
                  setAvaliacaoHistorica(null);
                  try {
                    const { resultado } = await api("/historico/avaliar", {
                      metodo: "POST",
                      corpo: {
                        inicio: inicioDaVigencia,
                        fim: fimDaVigencia,
                        gatilho: gatilhoDias,
                      },
                    });
                    setAvaliacaoHistorica(resultado);
                  } catch (falha) {
                    setErro(falha.message);
                  }
                }}
              >
                Analisar periodo no banco
              </button>
              {avaliacaoHistorica ? (
                <Aviso tipo="informacao">
                  {avaliacaoHistorica.acionaria
                    ? `Acionaria em ${avaliacaoHistorica.primeiroAcionamento}, com pagamento integral.`
                    : "Nao foi identificado acionamento na serie disponivel."}{" "}
                  Maior sequencia: {avaliacaoHistorica.maiorSequencia} dias. Dias incompletos:{" "}
                  {avaliacaoHistorica.diasIncompletos}. Esta consulta nao envia transacao.
                </Aviso>
              ) : null}
            </>
          ) : null}

          <Campo rotulo="Produto" htmlFor="produto">
            <select id="produto" value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
              <option value="">Escolha um produto…</option>
              {produtosCompativeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>

          {produtosCompativeis.length === 0 ? (
            <Aviso tipo="alerta">
              Nenhum produto configurado para a cultura <strong>{talhao?.cultura}</strong>.
            </Aviso>
          ) : null}
        </div>

        <div className="cartao">
          <h2>2. Cotacao</h2>

          {!produto ? (
            <p className="silencioso">Escolha um produto para ver o limite e o premio.</p>
          ) : !cotacao ? (
            <Carregando>Calculando…</Carregando>
          ) : (
            <>
              <div className="grade">
                <div className="indicador">
                  <div className="rotulo">Limite contratado</div>
                  <div className="valor">{emEth(cotacao.valorIndenizacaoWei)}</div>
                  <div className="nota">
                    {cotacao.areaSeguradaHa} ha x {produto.valorPorHectareEth} ETH/ha
                  </div>
                </div>
                <div className="indicador">
                  <div className="rotulo">Premio</div>
                  <div className="valor">{emEth(cotacao.premioWei)}</div>
                  <div className="nota">taxa de {produto.taxaPremioBps / 100}% do limite</div>
                </div>
              </div>

              <Campo rotulo="Vigencia">
                <div>
                  {cotacao.termos.vigenciaDias} dias a partir de{" "}
                  {new Date(`${inicioDaVigencia}T12:00:00Z`).toLocaleDateString("pt-BR")}
                </div>
              </Campo>
            </>
          )}
        </div>
      </div>

      {termos && produto ? (
        <div className="cartao">
          <h2>3. O que aciona o pagamento</h2>

          <Aviso tipo="informacao" titulo="Em palavras:">
            {textoDaCondicao}
          </Aviso>

          <p className="silencioso">
            Nao ha vistoria nem pericia. O oraculo publica o indice medido, o contrato compara com o
            limiar e, se bater, transfere na mesma transacao.
          </p>

          <div className="tabela-rolavel">
            <table className="tabela-exemplos">
              <thead>
                <tr>
                  <th>Dias seguidos sem chuva</th>
                  <th>Aciona?</th>
                  <th className="numero">Percentual</th>
                  <th className="numero">Voce recebe</th>
                </tr>
              </thead>
              <tbody>
                {exemplos.map((exemplo) => (
                  <tr
                    key={exemplo.diasSemChuva}
                    className={exemplo.percentualBps > 0 ? "aciona" : ""}
                  >
                    <td>{exemplo.diasSemChuva} dias</td>
                    <td>{exemplo.percentualBps > 0 ? "Sim" : "Nao"}</td>
                    <td className="numero">{emPercentual(exemplo.percentualBps)}</td>
                    <td className="numero">{emEth(exemplo.valorWei)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="linha-de-botoes" style={{ marginTop: 16 }}>
            <button
              onClick={enviarProposta}
              disabled={Boolean(enviada) || enviando || !usuario?.carteira}
            >
              {enviada
                ? "Proposta enviada"
                : enviando
                  ? "Enviando…"
                  : "Enviar proposta a seguradora"}
            </button>
            {enviada ? (
              <button className="secundario" onClick={() => setEnviada(null)}>
                Nova simulacao
              </button>
            ) : null}
          </div>

          <RodapeDaFronteira>
            Limite e premio calculados pelo servidor, em inteiros sobre wei. Os exemplos vem de{" "}
            <code>regraDeGatilho.js</code>, a mesma regra que o contrato executa, conferida por
            teste automatizado caso a caso.
          </RodapeDaFronteira>
        </div>
      ) : null}
    </div>
  );
}
