import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";

import { api } from "../api/cliente";

import { useCarteira } from "../cadeia/CarteiraContexto";
import { useSessao } from "../sessao/SessaoContexto";
import { PERFIS } from "../sessao/perfis";
import { contratoApolice, lerApolice, lerLinhaDoTempo, lerPublicacoes } from "../cadeia/contratos";
import {
  deBytes32,
  emData,
  emDataHora,
  emEth,
  explicacaoSituacao,
  hashCurto,
  mensagemDeErro,
  periodoEmData,
} from "../cadeia/formatos";
import {
  Aviso,
  Campo,
  Carregando,
  Indicador,
  LinkDaCadeia,
  RodapeDaFronteira,
  Selo,
  SeloSituacao,
} from "../componentes/ui";

/** Termos e eventos lidos da cadeia; documento e procedencia consultados na API. */

/** Titulos legiveis para cada evento do contrato. */
const TITULOS = {
  ApoliceImplantada: "Apolice implantada na rede",
  GarantiaDepositada: "Seguradora depositou a garantia",
  IndicesPublicados: "Oraculo publicou os indices do periodo",
  CondicaoAvaliada: "Contrato avaliou a condicao contratada",
  PagamentoExecutado: "Indenizacao transferida ao produtor",
  GarantiaResgatada: "Garantia devolvida a seguradora",
  ApoliceCancelada: "Apolice cancelada antes da vigencia",
};

/** Descricao de cada evento, com os argumentos que importam. */
function descreverEvento(evento) {
  const a = evento.argumentos;

  switch (evento.nome) {
    case "ApoliceImplantada":
      return `Limite de ${emEth(a.valorIndenizacao)} para o talhao ${deBytes32(a.talhao)}.`;
    case "GarantiaDepositada":
      return `${emEth(a.valor)} retidos no contrato como lastro da indenizacao.`;
    case "IndicesPublicados":
      return `Periodo ${periodoEmData(a.periodo)} — indice climatico de ${a.indiceClimatico} dia(s) sem chuva.`;
    case "CondicaoAvaliada":
      return a.atendida
        ? "Condicao atendida: o contrato paga a indenizacao integral."
        : "Condicao nao atendida neste periodo. Nenhum valor foi movimentado.";
    case "PagamentoExecutado":
      return `${emEth(a.valor)} transferidos sem aprovacao humana, na mesma transacao que publicou o indice.`;
    case "GarantiaResgatada":
      return `${emEth(a.valor)} devolvidos apos o fim da vigencia sem acionamento.`;
    case "ApoliceCancelada":
      return Number(a.garantiaDevolvida) > 0
        ? `${emEth(a.garantiaDevolvida)} de garantia devolvidos a seguradora.`
        : "Cancelada antes do deposito da garantia; nenhum valor movimentado.";
    default:
      return "";
  }
}

/** Recalcula o keccak256 do texto da API e compara com o hash lido na cadeia. */
function ConferenciaDosTermos({ descricao, hashNoContrato }) {
  if (!descricao) {
    return (
      <div className="cartao">
        <h2>Conferencia dos termos</h2>
        <p className="silencioso">
          O texto dos termos nao esta disponivel na API. O resumo gravado no contrato continua
          disponivel acima; nao foi possivel conferir o documento nesta consulta.
        </p>
      </div>
    );
  }

  const recalculado = ethers.keccak256(ethers.toUtf8Bytes(descricao));
  const confere = recalculado.toLowerCase() === String(hashNoContrato).toLowerCase();

  return (
    <div className="cartao">
      <h2>Conferencia dos termos (RF08)</h2>
      <p className={confere ? "conferencia-ok" : "conferencia-falha"}>
        {confere
          ? "O texto dos termos guardado corresponde exatamente ao que foi gravado no contrato."
          : "ATENCAO: o texto dos termos guardado NAO corresponde ao resumo gravado no contrato."}
      </p>

      <Campo rotulo="Texto dos termos">
        <textarea readOnly rows={4} className="mono" value={descricao.split("|").join("\n")} />
      </Campo>

      <div className="tabela-rolavel">
        <table>
          <tbody>
            <tr>
              <th>Resumo recalculado neste navegador</th>
              <td className="mono">{recalculado}</td>
            </tr>
            <tr>
              <th>Resumo gravado no contrato</th>
              <td className="mono">{hashNoContrato}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <RodapeDaFronteira>
        O resumo e recalculado aqui, e nao informado pelo servidor. A conferencia nao depende de
        confiar em quem guarda o documento — so no texto e no contrato.
      </RodapeDaFronteira>
    </div>
  );
}

/** Procedencia de um indice publicado, segundo o relato do oraculo. */
function Procedencia({ relato }) {
  if (!relato) return <span className="silencioso">—</span>;

  const origem = relato.procedencia;

  return (
    <div className="silencioso">
      {origem?.estacao ? `INMET ${origem.estacao}` : "Procedencia historica nao informada"}
      {origem?.inicio ? (
        <div>
          {origem.inicio} a {origem.fim} (UTC)
        </div>
      ) : null}
      {relato.gas_usado ? <div>gas {Number(relato.gas_usado).toLocaleString("pt-BR")}</div> : null}
      {relato.latencia_ms !== null && relato.latencia_ms !== undefined ? (
        <div>{relato.latencia_ms} ms</div>
      ) : null}
      {!relato.confirmada_na_cadeia ? <Selo tipo="alerta">nao confirmada</Selo> : null}
    </div>
  );
}

export default function ApoliceDetalhe() {
  const { endereco } = useParams();
  const { provedorLeitura, signatario, conta, redeCorreta } = useCarteira();
  const { perfil } = useSessao();

  const [apolice, setApolice] = useState(null);
  const [publicacoes, setPublicacoes] = useState([]);
  const [linhaDoTempo, setLinhaDoTempo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [operando, setOperando] = useState(false);
  const [doBackend, setDoBackend] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);

    try {
      const [dados, pubs, eventos] = await Promise.all([
        lerApolice(endereco, provedorLeitura),
        lerPublicacoes(endereco, provedorLeitura),
        lerLinhaDoTempo(endereco, provedorLeitura),
      ]);

      setApolice(dados);
      setPublicacoes(pubs);
      setLinhaDoTempo(eventos);

      // O que a cadeia nao guarda: o texto dos termos e a procedencia de cada
      // indice. Apolice desconhecida do backend nao impede a tela de funcionar.
      api(`/apolices/${endereco}`)
        .then(setDoBackend)
        .catch(() => setDoBackend(null));
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [endereco, provedorLeitura]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Escuta ao vivo. O contrato emite os eventos na mesma transacao em que paga,
   * entao recarregar tudo quando um deles chega mantem a tela coerente sem
   * precisar montar o estado a partir do proprio evento.
   */
  useEffect(() => {
    const contrato = contratoApolice(endereco, provedorLeitura);
    const atualizar = () => carregar();

    contrato.on("IndicesPublicados", atualizar);
    contrato.on("PagamentoExecutado", atualizar);
    contrato.on("GarantiaDepositada", atualizar);
    contrato.on("ApoliceCancelada", atualizar);
    contrato.on("GarantiaResgatada", atualizar);

    return () => {
      contrato.removeAllListeners();
    };
  }, [endereco, provedorLeitura, carregar]);

  /** Deposito da garantia pela seguradora, direto da tela. */
  async function depositarGarantia() {
    setAviso(null);
    setErro(null);
    setOperando(true);

    try {
      const contrato = contratoApolice(endereco, signatario);
      const transacao = await contrato.depositarGarantia({
        value: apolice.termos.valorIndenizacao,
      });

      setAviso(`Transacao enviada: ${transacao.hash}. Aguardando confirmacao…`);
      await transacao.wait();
      setAviso("Garantia depositada. A apolice esta ativa e pronta para receber indices.");
      await carregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setOperando(false);
    }
  }

  /** Resgate da garantia apos o fim da vigencia sem acionamento. */
  async function resgatarGarantia() {
    setAviso(null);
    setErro(null);
    setOperando(true);

    try {
      const contrato = contratoApolice(endereco, signatario);
      const transacao = await contrato.resgatarGarantia();

      setAviso(`Transacao enviada: ${transacao.hash}. Aguardando confirmacao…`);
      await transacao.wait();

      // A apolice liquidada nao muda de situacao no resgate da sobra; so a que
      // venceu sem acionamento e que passa a ENCERRADA.
      setAviso(
        apolice.situacao === 2
          ? "Saldo excedente devolvido. A apolice continua liquidada."
          : "Garantia devolvida. A apolice foi encerrada.",
      );
      await carregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setOperando(false);
    }
  }

  /**
   * Cancelamento antes da vigencia (RF10). O produtor titular ou a seguradora
   * assinam com a propria carteira; a garantia, se houver, volta a seguradora.
   */
  async function cancelar() {
    const confirmado = window.confirm(
      "Cancelar a apolice? Depois de cancelada, ela nao cobre mais nada, e isso nao pode ser desfeito.",
    );
    if (!confirmado) return;

    setAviso(null);
    setErro(null);
    setOperando(true);

    try {
      const contrato = contratoApolice(endereco, signatario);
      const transacao = await contrato.cancelar();

      setAviso(`Transacao enviada: ${transacao.hash}. Aguardando confirmacao…`);
      await transacao.wait();
      setAviso("Apolice cancelada. A garantia, se ja depositada, voltou para a seguradora.");
      await carregar();
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setOperando(false);
    }
  }

  if (carregando) {
    return (
      <div className="pagina">
        <Carregando>Lendo a apolice na rede…</Carregando>
      </div>
    );
  }

  if (erro && !apolice) {
    return (
      <div className="pagina">
        <h1>Apolice</h1>
        <Aviso tipo="erro" titulo="Nao foi possivel ler a apolice.">
          {erro}
        </Aviso>
        <p className="silencioso mono">{endereco}</p>
      </div>
    );
  }

  const t = apolice.termos;
  const ehSeguradora =
    perfil === PERFIS.SEGURADORA &&
    conta &&
    conta.toLowerCase() === apolice.seguradora.toLowerCase();

  const relogioCobertura = apolice.instanteHistorico;
  const podeAssinar = Boolean(signatario) && redeCorreta;
  const vigenciaVencida = relogioCobertura > t.vigenciaFim;
  // Titular pela carteira conectada: e quem assina o cancelamento na rede.
  const ehProdutorTitular =
    perfil === PERFIS.PRODUTOR && conta && conta.toLowerCase() === t.produtor.toLowerCase();

  // A mesma regra do contrato: so antes do inicio da vigencia, e so enquanto a
  // apolice aguarda garantia ou esta ativa.
  const podeCancelar =
    (ehSeguradora || ehProdutorTitular) &&
    (apolice.situacao === 0 || apolice.situacao === 1) &&
    relogioCobertura < t.vigenciaInicio;

  /** Relato do oraculo sobre um periodo: fontes usadas, descartes, gas, latencia. */
  const relatoDoOraculo = (periodo) =>
    doBackend?.publicacoes?.find((r) => Number(r.periodo) === Number(periodo)) ?? null;

  /**
   * O contrato aceita o resgate em dois casos: apolice ativa com vigencia vencida,
   * e apolice liquidada com saldo excedente forcado por terceiros. A tela
   * espelha exatamente essa regra — oferecer um botao que o contrato recusaria
   * seria pior do que nao oferecer nenhum.
   */
  const podeResgatar =
    apolice.garantiaRetida > 0n &&
    ((apolice.situacao === 1 && vigenciaVencida) || apolice.situacao === 2);

  return (
    <div className="pagina">
      <div className="entre">
        <div>
          <h1>Talhão {deBytes32(t.talhao)}</h1>
          <p className="silencioso mono">{endereco}</p>
        </div>
        <div className="linha-de-botoes">
          <SeloSituacao situacao={apolice.situacao} />
        </div>
      </div>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {aviso ? <Aviso tipo="sucesso">{aviso}</Aviso> : null}

      <Aviso tipo="informacao">{explicacaoSituacao(apolice.situacao)}</Aviso>

      <Aviso tipo="alerta">
        Reproducao historica de Sao Simao. Datas da cobertura referem-se aos dados INMET; transacoes
        e ETH de teste pertencem a Sepolia atual. A contagem comeca no inicio da cobertura.
        Cancelamento permitido somente antes da primeira publicacao historica.
      </Aviso>
      {!redeCorreta && conta ? (
        <Aviso tipo="alerta">Selecione a rede Sepolia na MetaMask para assinar.</Aviso>
      ) : null}
      {podeCancelar ? (
        <div className="cartao">
          <h2>Cancelamento antes da reprodução</h2>
          <p className="silencioso">
            A reproducao ainda nao iniciou. Ate a primeira publicacao, o produtor ou a seguradora
            podem cancelar; a garantia depositada volta para a seguradora (RF10).
          </p>
          <button className="secundario" onClick={cancelar} disabled={operando || !podeAssinar}>
            {operando ? "Aguardando a carteira…" : "Cancelar apolice"}
          </button>
        </div>
      ) : null}

      <div className="grade">
        <Indicador rotulo="Limite contratado" valor={emEth(t.valorIndenizacao)} />
        <Indicador
          rotulo="Garantia retida"
          valor={emEth(apolice.garantiaRetida)}
          nota="lastro depositado pela seguradora"
        />
        <Indicador
          rotulo="Valor pago"
          valor={emEth(apolice.valorPago)}
          nota={
            apolice.periodoAcionador > 0
              ? `acionado em ${periodoEmData(apolice.periodoAcionador)}`
              : "nenhum acionamento"
          }
        />
        <Indicador
          rotulo="Periodos publicados"
          valor={apolice.totalPeriodos}
          nota="datas historicas informadas pelo oraculo"
        />
      </div>

      {ehSeguradora ? (
        <div className="cartao">
          <h2>Acoes da seguradora</h2>
          <div className="linha-de-botoes">
            {apolice.situacao === 0 ? (
              <button onClick={depositarGarantia} disabled={operando || !podeAssinar}>
                {operando ? "Aguardando a carteira…" : `Depositar ${emEth(t.valorIndenizacao)}`}
              </button>
            ) : null}

            {podeResgatar ? (
              <button onClick={resgatarGarantia} disabled={operando || !podeAssinar}>
                {operando
                  ? "Aguardando a carteira…"
                  : apolice.situacao === 2
                    ? `Resgatar a sobra de ${emEth(apolice.garantiaRetida)}`
                    : "Resgatar garantia"}
              </button>
            ) : null}

            {apolice.situacao === 1 && !vigenciaVencida ? (
              <span className="silencioso">
                Aguarde o oraculo concluir a analise ate {emData(t.vigenciaFim)}. Se nao houver
                acionamento, a publicacao do ultimo dia libera o resgate da garantia.
              </span>
            ) : null}

            {/* Saldo eventualmente forcado por terceiros pode ser recuperado. */}
            {apolice.situacao === 2 && apolice.garantiaRetida > 0n ? (
              <span className="silencioso">
                A indenizacao integral ja foi paga. Um saldo excedente pode ser recuperado pela
                seguradora.
              </span>
            ) : null}

            {!podeResgatar && !(apolice.situacao === 1 && !vigenciaVencida) ? (
              <span className="silencioso">Nao ha acoes pendentes nesta apolice.</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grade-2">
        <div className="cartao">
          <h2>Termos contratados</h2>

          <Campo rotulo="Produtor">
            <LinkDaCadeia valor={t.produtor} tipo="address" curto={false} />
          </Campo>

          <Campo rotulo="Seguradora">
            <LinkDaCadeia valor={apolice.seguradora} tipo="address" curto={false} />
          </Campo>

          <Campo rotulo="Cultura">{deBytes32(t.cultura)}</Campo>

          <Campo rotulo="Condicao contratada">
            {t.limiarClimatico} dias consecutivos sem chuva
          </Campo>

          <Campo rotulo="Pagamento">Integral, em parcela unica, ao atingir o gatilho.</Campo>

          <Campo rotulo="Vigencia">
            {emData(t.vigenciaInicio)} a {emData(t.vigenciaFim)}
          </Campo>

          <Campo
            rotulo="Resumo criptografico dos termos"
            ajuda="Gravado na implantacao. Qualquer alteracao no documento contratual produz um resumo diferente, e portanto detectavel (RF08)."
          >
            <div className="mono" title={t.hashTermos}>
              {hashCurto(t.hashTermos)}
            </div>
          </Campo>

          <Campo
            rotulo="Registro de oraculos"
            ajuda="Contrato consultado a cada publicacao para conferir se a origem do dado esta autorizada (RF18)."
          >
            <LinkDaCadeia valor={t.registry} tipo="address" />
          </Campo>
        </div>

        <div className="cartao">
          <h2>Indices publicados</h2>

          {publicacoes.length === 0 ? (
            <p className="silencioso">
              Nenhum indice publicado ainda. O oraculo publica o primeiro acionamento ou o ultimo
              dia da cobertura.
            </p>
          ) : (
            <div className="tabela-rolavel">
              <table>
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th className="numero">Clima</th>
                    <th>Procedencia</th>
                  </tr>
                </thead>
                <tbody>
                  {publicacoes.map((p) => (
                    <tr key={p.periodo}>
                      <td>
                        {periodoEmData(p.periodo)}
                        <div className="silencioso">{emDataHora(p.publicadoEm)}</div>
                      </td>
                      <td className="numero">{p.indiceClimatico} dias</td>
                      <td>
                        <Procedencia relato={relatoDoOraculo(p.periodo)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <RodapeDaFronteira>
            O contrato nao verifica se o indice esta correto, so se quem publicou estava autorizado.
            A proveniencia de cada publicacao — a estacao e o intervalo historico consultados, o gas
            consumido e a latencia — fica registrada no backend do oraculo, ao lado de cada periodo,
            para que qualquer pessoa possa conferir a leitura (RNF18, RNF19).
          </RodapeDaFronteira>
        </div>
      </div>

      <ConferenciaDosTermos
        descricao={doBackend?.descricaoDosTermos ?? null}
        hashNoContrato={t.hashTermos}
      />

      <div className="cartao">
        <h2>Linha do tempo</h2>
        <p className="silencioso">
          Reconstruida a partir dos eventos registrados na rede, e nao de um banco de dados. E o que
          permite a qualquer parte auditar a decisao de pagamento (RF09, RNF18).
        </p>

        {linhaDoTempo.length === 0 ? (
          <p className="silencioso">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="linha-do-tempo">
            {linhaDoTempo.map((evento) => (
              <li
                key={`${evento.txHash}-${evento.indiceNoBloco}`}
                className={evento.nome === "PagamentoExecutado" ? "pagamento" : ""}
              >
                <div className="titulo-evento">
                  {TITULOS[evento.nome] ?? evento.nome}{" "}
                  {evento.nome === "PagamentoExecutado" ? (
                    <Selo tipo="sucesso">sem intervencao humana</Selo>
                  ) : null}
                </div>
                <div className="detalhe">{descreverEvento(evento)}</div>
                <div className="detalhe">
                  {emDataHora(evento.em)} · bloco {evento.bloco} ·{" "}
                  <LinkDaCadeia valor={evento.txHash} tipo="tx" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
