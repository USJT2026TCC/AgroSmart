import { ESCOPO, talhaoNoEscopo } from "../../../../configuracao/escopo.js";
import limites from "../../../../configuracao/historico.json";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../../api/cliente";
import { useSessao } from "../../sessao/SessaoContexto";
import { condicaoEmPalavras } from "../../cadeia/regraDeGatilho";
import { emEth } from "../../cadeia/formatos";
import { Aviso, Campo, Carregando, RodapeDaFronteira } from "../../componentes/ui";

const EM_ANALISE = ["pendente", "preparada"];

const emDataCurta = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR");

/**
 * Cobertura historica, valor total do produto e envio da proposta.
 *
 * A demonstracao tem um unico produto, entao ele vem escolhido: o produtor so
 * decide talhao, periodo e gatilho, e ve a cotacao ao lado enquanto ajusta.
 */
export default function Cotacao() {
  const { usuario } = useSessao();
  const [busca] = useSearchParams();
  const talhaoSolicitado = busca.get("talhao");

  const [talhoes, setTalhoes] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [propostas, setPropostas] = useState([]);
  const [talhaoId, setTalhaoId] = useState("");
  const [inicioDaVigencia, setInicioDaVigencia] = useState("2024-02-07");
  const [fimDaVigencia, setFimDaVigencia] = useState("2025-02-07");
  const [gatilhoDias, setGatilhoDias] = useState(30);
  const [avaliacaoHistorica, setAvaliacaoHistorica] = useState(null);
  const [cotacao, setCotacao] = useState(null);
  const [enviada, setEnviada] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const analiseAtual = useRef(0);

  function invalidarConsulta() {
    analiseAtual.current++;
    setCotacao(null);
    setAvaliacaoHistorica(null);
    setAnalisando(false);
  }

  useEffect(
    () => () => {
      analiseAtual.current++;
    },
    [],
  );

  useEffect(() => {
    Promise.all([api("/talhoes"), api("/produtos"), api("/propostas")])
      .then(([t, p, pr]) => {
        const ativos = p.produtos.filter((x) => x.ativo !== false && x.cultura === ESCOPO.cultura);
        const ocupados = new Set(
          pr.propostas.filter((x) => EM_ANALISE.includes(x.situacao)).map((x) => x.talhao.id),
        );
        const livres = t.talhoes.filter(
          (x) =>
            talhaoNoEscopo(x) &&
            ativos.some((pp) => pp.cultura === x.cultura) &&
            !ocupados.has(x.id),
        );
        setTalhoes(t.talhoes);
        setProdutos(ativos);
        setPropostas(pr.propostas);
        setTalhaoId((livres.find((x) => x.id === talhaoSolicitado) ?? livres[0])?.id ?? "");
      })
      .catch((falha) => setErro(falha.message));
  }, [talhaoSolicitado]);

  const emAnalise = useMemo(
    () => new Set(propostas.filter((x) => EM_ANALISE.includes(x.situacao)).map((x) => x.talhao.id)),
    [propostas],
  );
  const talhoesNoEscopo =
    talhoes?.filter((t) => talhaoNoEscopo(t) && produtos.some((p) => p.cultura === t.cultura)) ??
    [];
  const talhoesLivres = talhoesNoEscopo.filter((t) => !emAnalise.has(t.id));
  const talhao = talhoesLivres.find((t) => t.id === talhaoId) ?? null;
  const produto = produtos.find((p) => p.cultura === talhao?.cultura) ?? null;

  /** Recalcula a cotacao no servidor a cada mudanca de talhao, periodo ou gatilho. */
  useEffect(() => {
    setCotacao(null);
    let cancelado = false;
    if (!talhao || !produto) return undefined;

    const temporizador = setTimeout(() => {
      api("/cotacoes", {
        metodo: "POST",
        corpo: {
          talhaoId: talhao.id,
          produtoId: produto.id,
          inicioDaVigencia,
          fimDaVigencia,
          gatilhoDias,
        },
      })
        .then(({ cotacao: c }) => {
          if (cancelado) return;
          setCotacao(c);
          setErro(null);
        })
        .catch((falha) => {
          if (!cancelado) setErro(falha.message);
        });
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [talhao, produto, inicioDaVigencia, fimDaVigencia, gatilhoDias]);

  /** A condicao em linguagem corrente (RNF04). */
  const textoDaCondicao = useMemo(
    () => (produto ? condicaoEmPalavras(cotacao?.termos ?? produto) : null),
    [produto, cotacao],
  );

  async function analisarPeriodo() {
    const consulta = ++analiseAtual.current;
    setErro(null);
    setAvaliacaoHistorica(null);
    setAnalisando(true);
    try {
      const { resultado } = await api("/historico/avaliar", {
        metodo: "POST",
        corpo: { inicio: inicioDaVigencia, fim: fimDaVigencia, gatilho: gatilhoDias },
      });
      if (consulta === analiseAtual.current) setAvaliacaoHistorica(resultado);
    } catch (falha) {
      if (consulta === analiseAtual.current) setErro(falha.message);
    } finally {
      if (consulta === analiseAtual.current) setAnalisando(false);
    }
  }

  async function enviarProposta() {
    setErro(null);
    setEnviando(true);

    try {
      const { proposta } = await api("/propostas", {
        metodo: "POST",
        corpo: {
          talhaoId: talhao.id,
          produtoId: produto.id,
          inicioDaVigencia,
          fimDaVigencia,
          gatilhoDias,
        },
      });
      setEnviada(proposta);
      setPropostas((atuais) => [proposta, ...atuais]);
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  const mudar = (definir) => (e) => {
    definir(e.target.value);
    invalidarConsulta();
  };

  if (talhoes === null) {
    return (
      <div className="pagina">
        <h1>Simular e contratar</h1>
        {erro ? (
          <Aviso tipo="erro">{erro}</Aviso>
        ) : (
          <Carregando>Carregando seus talhões…</Carregando>
        )}
      </div>
    );
  }

  if (enviada) {
    return (
      <div className="pagina">
        <h1>Simular e contratar</h1>
        <Aviso tipo="sucesso" titulo="Proposta enviada à seguradora.">
          Agora a seguradora analisa a solicitação, emite a apólice e deposita a garantia. Enquanto
          isso, este talhão não recebe outra proposta.
        </Aviso>
        <Link to="/produtor">Acompanhar em Meus talhões e seguros</Link>
      </div>
    );
  }

  if (talhoesNoEscopo.length === 0 || talhoesLivres.length === 0) {
    const todosEmAnalise = talhoesNoEscopo.length > 0;
    return (
      <div className="pagina">
        <h1>Simular e contratar</h1>
        <Aviso
          tipo={todosEmAnalise ? "informacao" : "alerta"}
          titulo={
            todosEmAnalise
              ? "Sua proposta está em análise pela seguradora."
              : "Nenhum talhão disponível para contratar."
          }
        >
          {todosEmAnalise
            ? "Cada talhão recebe uma proposta por vez. Assim que a seguradora emitir ou recusar, você pode fazer uma nova."
            : "Peça à seguradora para cadastrar um talhão de soja em São Simão/SP no seu login."}
        </Aviso>
        <Link to="/produtor">Ver meus talhões e seguros</Link>
      </div>
    );
  }

  const podeEnviar = Boolean(cotacao) && Boolean(usuario?.carteira) && !enviando;

  return (
    <div className="pagina">
      <h1>Simular e contratar</h1>
      <p className="silencioso">
        Escolha o talhão, o período e o gatilho. A cotação ao lado se atualiza sozinha. Enviar a
        proposta não emite a apólice nem movimenta ETH: isso acontece quando a seguradora aprova.
      </p>

      {!usuario?.carteira ? (
        <Aviso tipo="alerta" titulo="Carteira não vinculada.">
          Você pode simular, mas para enviar a proposta é preciso{" "}
          <Link to="/produtor/carteira">vincular sua carteira</Link>. É para ela que a indenização é
          transferida.
        </Aviso>
      ) : null}

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <div className="grade-2">
        <div className="cartao">
          <h2>Sua solicitação</h2>

          <Campo rotulo="Talhão" htmlFor="talhao">
            <select
              id="talhao"
              value={talhaoId}
              onChange={(e) => {
                setTalhaoId(e.target.value);
                invalidarConsulta();
              }}
            >
              {talhoesLivres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.identificador} — {t.propriedade.nome} (
                  {Number(t.areaHa).toLocaleString("pt-BR")} ha)
                </option>
              ))}
            </select>
          </Campo>
          {talhoesNoEscopo.length > talhoesLivres.length ? (
            <p className="silencioso">
              Talhões com proposta em análise não aparecem aqui até a seguradora decidir.
            </p>
          ) : null}

          <div className="grade">
            <Campo rotulo="Início da cobertura" htmlFor="inicio">
              <input
                id="inicio"
                type="date"
                min={limites.inicio}
                max={limites.fim}
                value={inicioDaVigencia}
                onChange={mudar(setInicioDaVigencia)}
              />
            </Campo>
            <Campo rotulo="Fim da cobertura" htmlFor="fim-historico">
              <input
                id="fim-historico"
                type="date"
                min={inicioDaVigencia}
                max={limites.fim}
                value={fimDaVigencia}
                onChange={mudar(setFimDaVigencia)}
              />
            </Campo>
          </div>

          <Campo
            rotulo="Gatilho (dias seguidos sem chuva)"
            htmlFor="gatilho-dias"
            ajuda="Dia seco: menos de 1 mm de chuva. Valor experimental, de 1 a 366 dias."
          >
            <input
              id="gatilho-dias"
              type="number"
              min={limites.gatilhoMinimo}
              max={limites.gatilhoMaximo}
              value={gatilhoDias}
              onChange={(e) => {
                setGatilhoDias(Number(e.target.value));
                invalidarConsulta();
              }}
            />
          </Campo>

          <p className="silencioso">
            Produto: <strong>{produto?.nome}</strong> · dados do INMET, estação A770 (São Simão/SP),
            de {emDataCurta(limites.inicio)} a {emDataCurta(limites.fim)}.
          </p>
        </div>

        <div className="cartao">
          <h2>Sua cotação</h2>

          {!cotacao ? (
            erro ? (
              <p>Não foi possível calcular. Corrija o motivo indicado acima.</p>
            ) : (
              <Carregando>Calculando…</Carregando>
            )
          ) : (
            <>
              <div className="indicador">
                <div className="rotulo">Indenização total</div>
                <div className="valor">{emEth(cotacao.valorIndenizacaoWei)}</div>
                <div className="nota">Paga uma única vez, se o gatilho for atingido.</div>
              </div>

              <p>{textoDaCondicao}</p>
              <p className="silencioso">
                Cobertura de {emDataCurta(inicioDaVigencia)} a {emDataCurta(fimDaVigencia)}.
              </p>

              <button
                type="button"
                className="secundario"
                onClick={analisarPeriodo}
                disabled={analisando}
              >
                {analisando ? "Consultando…" : "Ver o que aconteceu nesse período"}
              </button>
              {avaliacaoHistorica ? (
                <Aviso tipo={avaliacaoHistorica.acionaria ? "sucesso" : "informacao"}>
                  {avaliacaoHistorica.acionaria
                    ? `Com esse gatilho, o pagamento seria acionado em ${avaliacaoHistorica.primeiroAcionamento}.`
                    : "Com esse gatilho, o pagamento não seria acionado nesse período."}{" "}
                  Maior sequência seca: {avaliacaoHistorica.maiorSequencia} dias. Dias sem dados
                  suficientes: {avaliacaoHistorica.diasIncompletos}.
                </Aviso>
              ) : null}

              <div className="linha-de-botoes" style={{ marginTop: 16 }}>
                <button onClick={enviarProposta} disabled={!podeEnviar}>
                  {enviando ? "Enviando…" : "Enviar proposta à seguradora"}
                </button>
              </div>
            </>
          )}

          <RodapeDaFronteira>
            Contratação hipotética com dados reais do INMET. O talhão é considerado coincidente com
            a estação, e o gatilho não estima prejuízo agrícola. Pagamentos usam ETH de teste da
            Sepolia.
          </RodapeDaFronteira>
        </div>
      </div>
    </div>
  );
}
