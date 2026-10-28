import { ethers } from "ethers";

import { ABI_APOLICE, ABI_FACTORY, ABI_REGISTRY } from "./abis";
import { blocoInicial, enderecosDaRede } from "./rede";

/**
 * Leitura e escrita nos contratos.
 *
 * Todas as funcoes recebem explicitamente o provedor ou o signatario, em vez de
 * pegarem um global. Assim fica visivel, em cada chamada, se a operacao e de
 * leitura (funciona sem carteira) ou de escrita (exige assinatura).
 */

export function contratoFactory(provedorOuSignatario) {
  const enderecos = enderecosDaRede();

  if (!enderecos) {
    throw new Error(
      "Nenhum contrato implantado para esta rede. Rode o script de implantacao e depois `npm run enderecos`.",
    );
  }

  return new ethers.Contract(enderecos.ApoliceFactory, ABI_FACTORY, provedorOuSignatario);
}

export function contratoRegistry(provedorOuSignatario) {
  const enderecos = enderecosDaRede();

  if (!enderecos) throw new Error("Nenhum contrato implantado para esta rede.");

  return new ethers.Contract(enderecos.OracleRegistry, ABI_REGISTRY, provedorOuSignatario);
}

export function contratoApolice(endereco, provedorOuSignatario) {
  return new ethers.Contract(endereco, ABI_APOLICE, provedorOuSignatario);
}

/**
 * Blocos por consulta de eventos. Nos publicos limitam o intervalo de
 * `eth_getLogs`: o da Sepolia usado na demonstracao recusa 50 mil blocos, e o
 * plano gratuito de outros provedores aceita bem menos. Uma apolice de 180 dias
 * cobre cerca de 1,3 milhao de blocos; sem dividir, a linha do tempo parava de
 * abrir uma semana depois da emissao.
 */
export const BLOCOS_POR_CONSULTA = 10_000;
const CONSULTAS_SIMULTANEAS = 4;

// O no publico da Sepolia distribui os pedidos entre servidores que guardam
// historicos de tamanhos diferentes; o mesmo trecho e recusado por um ("pruned
// history unavailable") e respondido pelo seguinte. Para producao, o certo e um
// no com historico completo, configurado em VITE_RPC_SEPOLIA no build.
export const TENTATIVAS_POR_TRECHO = 4;

async function consultarTrecho(contrato, filtro, de, ate, espera) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await contrato.queryFilter(filtro, de, ate);
    } catch (erro) {
      if (tentativa >= TENTATIVAS_POR_TRECHO) throw erro;
      await new Promise((r) => setTimeout(r, espera * tentativa));
    }
  }
}

/**
 * Eventos de `contrato` entre `desde` e o bloco atual, em trechos de
 * BLOCOS_POR_CONSULTA, no maximo CONSULTAS_SIMULTANEAS de cada vez.
 */
export async function eventosEmTrechos(contrato, filtro, desde, provedor, { espera = 300 } = {}) {
  const ate = await provedor.getBlockNumber();
  const trechos = [];
  for (let de = desde; de <= ate; de += BLOCOS_POR_CONSULTA) {
    trechos.push([de, Math.min(ate, de + BLOCOS_POR_CONSULTA - 1)]);
  }

  const resultados = new Array(trechos.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONSULTAS_SIMULTANEAS, trechos.length) }, async () => {
      while (proximo < trechos.length) {
        const i = proximo++;
        resultados[i] = await consultarTrecho(contrato, filtro, ...trechos[i], espera);
      }
    }),
  );

  return resultados.flat();
}

/** Converte a struct Termos devolvida pelo contrato em objeto simples. */
function normalizarTermos(bruto) {
  return {
    produtor: bruto.produtor,
    registry: bruto.registry,
    cultura: bruto.cultura,
    talhao: bruto.talhao,
    limiarClimatico: Number(bruto.limiarClimatico),
    vigenciaInicio: Number(bruto.vigenciaInicio),
    vigenciaFim: Number(bruto.vigenciaFim),
    valorIndenizacao: bruto.valorIndenizacao,
    hashTermos: bruto.hashTermos,
  };
}

/**
 * Estado completo de uma apolice, em uma unica ida a rede por campo.
 *
 * As leituras vao em `Promise.all` de proposito: em Sepolia, seis chamadas em
 * sequencia somam quase um segundo de espera visivel na tela.
 */
export async function lerApolice(endereco, provedor) {
  const contrato = contratoApolice(endereco, provedor);

  const [termos, situacao, valorPago, periodoAcionador, garantiaRetida, total, seguradora] =
    await Promise.all([
      contrato.verTermos(),
      contrato.situacao(),
      contrato.valorPago(),
      contrato.periodoAcionador(),
      contrato.garantiaRetida(),
      contrato.totalPeriodos(),
      contrato.seguradora(),
    ]);

  let modoHistorico = false,
    instanteHistorico = null;
  try {
    modoHistorico = await contrato.modoHistorico();
    if (modoHistorico) instanteHistorico = Number(await contrato.instanteHistorico());
  } catch (erro) {
    // Contratos anteriores nao possuem esses seletores. Falhas de rede continuam visiveis.
    if (erro.code !== "CALL_EXCEPTION" && !(erro instanceof TypeError)) throw erro;
  }
  return {
    modoHistorico,
    instanteHistorico,
    endereco,
    seguradora,
    termos: normalizarTermos(termos),
    situacao: Number(situacao),
    valorPago,
    periodoAcionador: Number(periodoAcionador),
    garantiaRetida,
    totalPeriodos: Number(total),
  };
}

/** Publicacoes registradas em uma apolice, da mais recente para a mais antiga. */
export async function lerPublicacoes(endereco, provedor) {
  const contrato = contratoApolice(endereco, provedor);
  const total = Number(await contrato.totalPeriodos());

  const periodos = await Promise.all(Array.from({ length: total }, (_, i) => contrato.periodos(i)));

  const publicacoes = await Promise.all(
    periodos.map(async (periodo) => {
      const bruto = await contrato.publicacao(periodo);

      return {
        periodo: Number(periodo),
        oraculo: bruto.oraculo,
        indiceClimatico: Number(bruto.indiceClimatico),
        publicadoEm: Number(bruto.publicadoEm),
      };
    }),
  );

  return publicacoes.sort((a, b) => b.periodo - a.periodo);
}

/**
 * Linha do tempo da apolice, reconstruida dos eventos da cadeia (RF09).
 *
 * Nada aqui vem de banco de dados: o historico e remontado a partir do que a
 * propria rede guarda, o que e justamente o que torna a decisao auditavel por
 * qualquer parte, sem depender da palavra da seguradora (RNF18).
 */
export async function lerLinhaDoTempo(endereco, provedor) {
  const contrato = contratoApolice(endereco, provedor);
  const desde = blocoInicial();

  const nomes = [
    "ApoliceImplantada",
    "GarantiaDepositada",
    "IndicesPublicados",
    "CondicaoAvaliada",
    "PagamentoExecutado",
    "GarantiaResgatada",
    "ApoliceCancelada", // RF10
  ];

  // Uma consulta por trecho para todos os eventos do contrato ("*"), e nao uma
  // por evento: sete vezes menos pedidos ao no.
  const eventos = (await eventosEmTrechos(contrato, "*", desde, provedor)).filter(
    (evento) => evento.fragment && nomes.includes(evento.fragment.name),
  );

  // Os blocos sao buscados uma unica vez por numero: varias publicacoes costumam
  // cair em blocos diferentes, mas os eventos de uma mesma transacao nao.
  const numerosDeBloco = [...new Set(eventos.map((e) => e.blockNumber))];
  const blocos = new Map(
    await Promise.all(
      numerosDeBloco.map(async (numero) => [numero, await provedor.getBlock(numero)]),
    ),
  );

  return eventos
    .map((evento) => ({
      nome: evento.fragment.name,
      bloco: evento.blockNumber,
      indiceNoBloco: evento.index,
      txHash: evento.transactionHash,
      em: blocos.get(evento.blockNumber)?.timestamp ?? null,
      argumentos: Object.fromEntries(
        evento.fragment.inputs.map((entrada, i) => [entrada.name, evento.args[i]]),
      ),
    }))
    .sort((a, b) => a.bloco - b.bloco || a.indiceNoBloco - b.indiceNoBloco);
}
