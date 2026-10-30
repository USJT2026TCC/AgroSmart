import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/cliente";
import { useAtualizacaoAutomatica } from "../../api/atualizacaoAutomatica";
import { useCarteira } from "../../cadeia/CarteiraContexto";
import { contratoApolice, contratoFactory } from "../../cadeia/contratos";
import { emEth, hashCurto, mensagemDeErro } from "../../cadeia/formatos";
import { implantacaoDaRede } from "../../cadeia/rede";
import { Aviso, Carregando, LinkDaCadeia, Selo } from "../../componentes/ui";

/** A API prepara e confere os termos historicos; a seguradora assina emissao e garantia na MetaMask. */

const ROTULOS = {
  pendente: ["alerta", "aguardando sua análise"],
  preparada: ["informacao", "aguardando assinatura"],
  emitida: ["sucesso", "emitida"],
  recusada: ["erro", "recusada"],
};

export default function Propostas() {
  const { signatario, conta, provedorLeitura, redeCorreta, rede, trocarDeRede, conectar } =
    useCarteira();

  const [propostas, setPropostas] = useState(null);
  const [ocupada, setOcupada] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [seguradoraDaFabrica, setSeguradoraDaFabrica] = useState(null);
  const [garantidas, setGarantidas] = useState({});

  const carregar = useCallback(async () => {
    try {
      setErro(null);
      const { propostas: lista } = await api("/propostas");
      setPropostas(lista);

      // A situacao da garantia vive no contrato; o backend ve pelo indexador, mas
      // com alguns segundos de atraso. Ler direto evita um botao obsoleto na tela.
      const emitidas = lista.filter((p) => p.apolice);
      const situacoes = await Promise.all(
        emitidas.map(async (p) => [
          p.id,
          Number(await contratoApolice(p.apolice.endereco, provedorLeitura).situacao()),
        ]),
      );
      setGarantidas(Object.fromEntries(situacoes.map(([id, s]) => [id, s >= 1])));
    } catch (falha) {
      setErro(falha.message);
    }
  }, [provedorLeitura]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  // Durante uma assinatura na MetaMask a lista fica parada, para nao trocar a tela no meio.
  useAtualizacaoAutomatica(() => ocupada === null && carregar());

  useEffect(() => {
    try {
      contratoFactory(provedorLeitura)
        .seguradora()
        .then(setSeguradoraDaFabrica)
        .catch(() => setSeguradoraDaFabrica(null));
    } catch {
      setSeguradoraDaFabrica(null);
    }
  }, [provedorLeitura]);

  async function emitir(proposta) {
    setErro(null);
    setAviso(null);
    setOcupada(proposta.id);

    try {
      setAviso("1/3 · Preparando os termos da apólice…");
      const preparo = await api(`/propostas/${proposta.id}/preparar`, {
        metodo: "POST",
      });

      if (
        preparo.fabrica?.toLowerCase() !==
        implantacaoDaRede()?.contratos.ApoliceFactory.toLowerCase()
      ) {
        throw new Error(
          "A fabrica informada pela API difere da interface. Atualize a aplicacao antes de emitir.",
        );
      }

      setAviso(
        `2/3 · Confirme a emissão na MetaMask. Resumo dos termos: ${hashCurto(preparo.hashTermos)}`,
      );
      const fabrica = contratoFactory(signatario);
      const transacao = await fabrica.emitirApoliceHistorica(preparo.termos);

      setAviso(`2/3 · Transação enviada (${hashCurto(transacao.hash)}). Aguardando confirmação…`);
      await transacao.wait();

      setAviso("3/3 · Conferindo a apólice na Sepolia…");
      await api(`/propostas/${proposta.id}/emissao`, {
        metodo: "POST",
        corpo: { txHash: transacao.hash },
      });

      setAviso(
        `Apólice emitida e conferida: os termos gravados no contrato são os da proposta. Próximo passo: depositar a garantia.`,
      );
      await carregar();
    } catch (falha) {
      setAviso(null);
      setErro(falha.status !== undefined ? falha.message : mensagemDeErro(falha));
    } finally {
      setOcupada(null);
    }
  }

  async function depositar(proposta) {
    setErro(null);
    setAviso(null);
    setOcupada(proposta.id);

    try {
      setAviso("Confirme o depósito da garantia na MetaMask…");
      const transacao = await contratoApolice(
        proposta.apolice.endereco,
        signatario,
      ).depositarGarantia({
        value: BigInt(proposta.valorIndenizacaoWei),
      });
      await transacao.wait();

      setAviso(
        `Garantia de ${emEth(proposta.valorIndenizacaoWei)} depositada. A apólice está ativa e o oráculo já pode avaliá-la.`,
      );
      await carregar();
    } catch (falha) {
      setAviso(null);
      setErro(mensagemDeErro(falha));
    } finally {
      setOcupada(null);
    }
  }

  async function recusar(proposta) {
    if (!window.confirm(`Recusar a proposta do talhão ${proposta.talhao.identificador}?`)) return;
    setErro(null);
    setAviso(null);
    try {
      await api(`/propostas/${proposta.id}/recusar`, { metodo: "POST" });
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  const carteiraErrada =
    conta && seguradoraDaFabrica && conta.toLowerCase() !== seguradoraDaFabrica.toLowerCase();

  const podeAssinar =
    Boolean(signatario) && redeCorreta && Boolean(seguradoraDaFabrica) && !carteiraErrada;

  const ordem = { pendente: 0, preparada: 0, emitida: 1 };
  const ativas = (propostas ?? [])
    .filter((p) => p.situacao !== "recusada")
    .sort((x, y) => (ordem[x.situacao] ?? 2) - (ordem[y.situacao] ?? 2));
  const recusadas = (propostas ?? []).filter((p) => p.situacao === "recusada");

  const cartaoDaProposta = (p) => {
    const [cor, rotulo] = ROTULOS[p.situacao] ?? ["neutro", p.situacao];
    const aberta = p.situacao === "pendente" || p.situacao === "preparada";
    const semGarantia = p.apolice && garantidas[p.id] === false;
    const ocupadaAqui = ocupada === p.id;
    // O contrato recusa produtor igual a seguradora; melhor avisar antes da MetaMask.
    const beneficiarioEhSeguradora =
      Boolean(p.carteiraProdutor) &&
      implantacaoDaRede()?.seguradora?.toLowerCase() === p.carteiraProdutor.toLowerCase();

    return (
      <div className="cartao" key={p.id}>
        <div className="entre">
          <h2>
            {p.talhao.identificador} — {p.produto.nome}
          </h2>
          <Selo tipo={cor}>{rotulo}</Selo>
        </div>

        <div className="tabela-rolavel">
          <table>
            <tbody>
              <tr>
                <th>Produtor</th>
                <td>
                  {p.produtor.nome} — <LinkDaCadeia valor={p.carteiraProdutor} tipo="address" />
                </td>
              </tr>
              <tr>
                <th>Área informada</th>
                <td>
                  {p.talhao.areaHa == null
                    ? "Não informada"
                    : `${Number(p.talhao.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ha`}{" "}
                  de {p.talhao.cultura}
                </td>
              </tr>
              <tr>
                <th>Gatilho</th>
                <td>{p.termos.limiarClimatico} dias consecutivos sem chuva</td>
              </tr>
              {p.termos.inicioHistorico ? (
                <tr>
                  <th>Cobertura</th>
                  <td>
                    {new Date(`${p.termos.inicioHistorico}T12:00:00Z`).toLocaleDateString("pt-BR")}{" "}
                    a {new Date(`${p.termos.fimHistorico}T12:00:00Z`).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ) : null}
              <tr>
                <th>Enviada em</th>
                <td>{new Date(p.criadaEm).toLocaleDateString("pt-BR")}</td>
              </tr>
              <tr>
                <th>Indenização total</th>
                <td>{emEth(p.valorIndenizacaoWei)}</td>
              </tr>
              {p.hashTermos ? (
                <tr>
                  <th>Resumo dos termos</th>
                  <td className="mono" title={p.hashTermos}>
                    {hashCurto(p.hashTermos)}
                  </td>
                </tr>
              ) : null}
              {p.apolice ? (
                <tr>
                  <th>Contrato</th>
                  <td>
                    <LinkDaCadeia valor={p.apolice.endereco} tipo="address" curto={false} />
                    <div className="silencioso">
                      emissao <LinkDaCadeia valor={p.apolice.txEmissao} tipo="tx" />
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {aberta && beneficiarioEhSeguradora ? (
          <Aviso tipo="erro" titulo="Esta proposta não pode ser emitida.">
            A carteira do produtor é a mesma da seguradora, e o contrato recusa esse caso. Recuse a
            proposta e peça ao produtor que vincule outra conta da MetaMask.
          </Aviso>
        ) : null}

        <div className="linha-de-botoes" style={{ marginTop: 14 }}>
          {aberta ? (
            <>
              <button
                onClick={() => emitir(p)}
                disabled={ocupada !== null || !podeAssinar || beneficiarioEhSeguradora}
              >
                {ocupadaAqui ? "Emitindo…" : "Aprovar e emitir apólice"}
              </button>
              <button className="perigo" onClick={() => recusar(p)} disabled={ocupada !== null}>
                Recusar
              </button>
            </>
          ) : null}

          {semGarantia ? (
            <button onClick={() => depositar(p)} disabled={ocupada !== null || !podeAssinar}>
              {ocupadaAqui
                ? "Aguardando a carteira…"
                : `Depositar garantia de ${emEth(p.valorIndenizacaoWei)}`}
            </button>
          ) : null}

          {p.apolice ? <Link to={`/apolice/${p.apolice.endereco}`}>Ver apólice</Link> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="pagina">
      <h1>Propostas</h1>
      <p className="silencioso">
        Aprovar uma proposta cria a apólice na Sepolia: você assina na MetaMask e o sistema confere
        se o contrato gravou exatamente os termos combinados. Depois, deposite a garantia.
      </p>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {aviso ? <Aviso tipo="informacao">{aviso}</Aviso> : null}

      {!seguradoraDaFabrica ? (
        <Aviso tipo="alerta">
          Aguardando confirmar a carteira da seguradora na Sepolia. A emissão fica bloqueada até
          essa consulta concluir.
        </Aviso>
      ) : null}
      {!conta ? (
        <Aviso tipo="alerta" titulo="Carteira não conectada.">
          <p>Para aprovar uma proposta, conecte a MetaMask com a conta da seguradora.</p>
          <button className="secundario pequeno" onClick={conectar}>
            Conectar carteira
          </button>
        </Aviso>
      ) : !redeCorreta ? (
        <Aviso tipo="alerta" titulo="Carteira em outra rede.">
          <button className="secundario pequeno" onClick={trocarDeRede}>
            Trocar para {rede.nome}
          </button>
        </Aviso>
      ) : carteiraErrada ? (
        <Aviso tipo="erro" titulo="A conta selecionada na MetaMask não é a da seguradora.">
          Abra a MetaMask e selecione a conta <span className="mono">{seguradoraDaFabrica}</span>. A
          MetaMask assina com a conta selecionada nela, não com o login do aplicativo, e o contrato
          só aceita a da seguradora.
        </Aviso>
      ) : null}

      {propostas === null ? (
        <Carregando />
      ) : propostas.length === 0 ? (
        <div className="cartao">
          <p>Nenhuma proposta recebida ainda.</p>
          <p className="silencioso">Elas aparecem aqui quando o produtor solicita um seguro.</p>
        </div>
      ) : (
        <>
          {ativas.map(cartaoDaProposta)}
          {recusadas.length > 0 ? (
            <details className="cartao avancado">
              <summary>Recusadas ({recusadas.length})</summary>
              {recusadas.map(cartaoDaProposta)}
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
