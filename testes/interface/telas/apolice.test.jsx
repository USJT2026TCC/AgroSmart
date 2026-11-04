/**
 * Detalhe da apolice (UC05 a UC08; RF10, RF14, RF15, RF16).
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ethers } from "ethers";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  CONTA_DA_SEGURADORA,
  CONTA_DO_PRODUTOR,
  abrir,
  achar,
  carteiraFalsa,
} from "./ambiente.jsx";

const ENDERECO = "0x00000000000000000000000000000000000a9011";
const TX = `0x${"34".repeat(32)}`;
const DESCRICAO = "AgroSmart|soja|talhao-01|30 dias consecutivos sem chuva|1 ETH";

const cadeia = vi.hoisted(() => ({
  apolice: null,
  publicacoes: [],
  linha: [],
  chamadas: [],
}));

vi.mock("../../../interface/src/cadeia/contratos.js", () => ({
  lerApolice: vi.fn(async () => cadeia.apolice),
  lerPublicacoes: vi.fn(async () => cadeia.publicacoes),
  lerLinhaDoTempo: vi.fn(async () => cadeia.linha),
  contratoApolice: vi.fn(() => {
    const tx = (nome) =>
      vi.fn(async (...args) => {
        cadeia.chamadas.push([nome, ...args]);
        return { hash: TX, wait: async () => ({ status: 1 }) };
      });
    return {
      on: () => {},
      removeAllListeners: () => {},
      cancelar: tx("cancelar"),
      depositarGarantia: tx("depositarGarantia"),
      resgatarGarantia: tx("resgatarGarantia"),
    };
  }),
}));

const agora = Math.floor(Date.now() / 1000);
const INICIO = Date.parse("2024-02-07T00:00:00Z") / 1000;
const FIM = Date.parse("2025-02-07T23:59:59Z") / 1000;

function apolice(sobrescritos = {}, termos = {}) {
  return {
    modoHistorico: true,
    instanteHistorico: INICIO,
    endereco: ENDERECO,
    seguradora: CONTA_DA_SEGURADORA,
    situacao: 1,
    valorPago: 0n,
    periodoAcionador: 0,
    garantiaRetida: ethers.parseEther("1"),
    totalPeriodos: 1,
    ...sobrescritos,
    termos: {
      produtor: CONTA_DO_PRODUTOR,
      registry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      cultura: ethers.encodeBytes32String("soja"),
      talhao: ethers.encodeBytes32String("talhao-01"),
      limiarClimatico: 30,
      vigenciaInicio: INICIO,
      vigenciaFim: FIM,
      valorIndenizacao: ethers.parseEther("1"),
      hashTermos: ethers.keccak256(ethers.toUtf8Bytes(DESCRICAO)),
      ...termos,
    },
  };
}

const publicacao = (sobrescritos = {}) => ({
  periodo: 20261007,
  oraculo: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  indiceClimatico: 3,
  publicadoEm: agora,
  ...sobrescritos,
});

let proximoIndice = 0;
const evento = (nome, argumentos) => ({
  nome,
  bloco: 10,
  indiceNoBloco: proximoIndice++,
  txHash: TX,
  em: agora,
  argumentos,
});

beforeEach(() => {
  cadeia.apolice = apolice();
  cadeia.publicacoes = [publicacao()];
  cadeia.linha = [
    evento("ApoliceImplantada", {
      valorIndenizacao: ethers.parseEther("1"),
      talhao: ethers.encodeBytes32String("talhao-01"),
    }),
    evento("GarantiaDepositada", { valor: ethers.parseEther("1") }),
    evento("IndicesPublicados", {
      periodo: 20261007n,
      indiceClimatico: 3,
    }),
    evento("CondicaoAvaliada", { atendida: false }),
  ];
  cadeia.chamadas.length = 0;
});

afterEach(() => {
  cleanup();
  delete window.ethereum;
  localStorage.clear();
});

const rotasDaApolice = (extra = {}) => ({
  "GET /apolices/:endereco": {
    descricaoDosTermos: DESCRICAO,
    publicacoes: [
      {
        periodo: 20261007,
        procedencia: {
          fontesUsadas: ["estacao-inmet-a770", "estacao-inmet-a747"],
          fontesDescartadas: [],
        },
        gas_usado: "956252",
        latencia_ms: 26713,
      },
    ],
  },
  ...extra,
});

describe("detalhe da apolice", () => {
  test("termos, publicacoes com procedencia e linha do tempo vinda da rede", async () => {
    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "produtor",
      rotas: rotasDaApolice(),
    });

    expect(await achar("Talhão talhao-01")).toBeTruthy();
    expect(await achar(/30 dias consecutivos sem chuva/)).toBeTruthy();
    expect(await achar("Oraculo publicou os indices do periodo")).toBeTruthy();
    expect(await achar(/Condicao nao atendida/)).toBeTruthy();
  });

  test("o resumo dos termos e recalculado no navegador e confere com o contrato", async () => {
    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "produtor",
      rotas: rotasDaApolice(),
    });
    expect(await achar(/corresponde exatamente ao que foi gravado no contrato/)).toBeTruthy();
  });

  test("termos adulterados no servidor sao denunciados", async () => {
    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "produtor",
      rotas: rotasDaApolice({
        "GET /apolices/:endereco": {
          descricaoDosTermos: `${DESCRICAO} (alterado)`,
          publicacoes: [],
        },
      }),
    });
    expect(await achar(/NAO corresponde ao resumo gravado no contrato/)).toBeTruthy();
  });

  test("antes da vigencia, o produtor titular cancela pela carteira", async () => {
    cadeia.apolice = apolice({ instanteHistorico: INICIO - 1 });
    carteiraFalsa(CONTA_DO_PRODUTOR);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "produtor",
      rotas: rotasDaApolice(),
    });

    const botao = await screen.findByRole("button", {
      name: "Cancelar apolice",
    });
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);

    expect(await achar(/Apolice cancelada/)).toBeTruthy();
    expect(cadeia.chamadas[0][0]).toBe("cancelar");
  });

  test("cancelar pede confirmacao, e desistir nao envia nada", async () => {
    cadeia.apolice = apolice({ instanteHistorico: INICIO - 1 });
    carteiraFalsa(CONTA_DO_PRODUTOR);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "produtor",
      rotas: rotasDaApolice(),
    });
    const botao = await screen.findByRole("button", {
      name: "Cancelar apolice",
    });
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);

    expect(cadeia.chamadas).toEqual([]);
  });

  test("a seguradora deposita a garantia de uma apolice recem-emitida", async () => {
    cadeia.apolice = apolice({ situacao: 0, garantiaRetida: 0n });
    carteiraFalsa(CONTA_DA_SEGURADORA);

    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "seguradora",
      rotas: rotasDaApolice(),
    });

    const botao = await screen.findByRole("button", { name: /Depositar/ });
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
    expect(await achar(/Garantia depositada/)).toBeTruthy();
  });

  test("liquidada integralmente: seguradora recupera saldo forcado", async () => {
    cadeia.apolice = apolice(
      {
        situacao: 2,
        valorPago: ethers.parseEther("1"),
        garantiaRetida: ethers.parseEther("0.25"),
        periodoAcionador: 20261007,
      },
      {},
    );
    cadeia.linha.push(evento("PagamentoExecutado", { valor: ethers.parseEther("1") }));
    carteiraFalsa(CONTA_DA_SEGURADORA);

    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "seguradora",
      rotas: rotasDaApolice(),
    });

    expect(await achar("sem intervencao humana")).toBeTruthy();
    const botao = await screen.findByRole("button", {
      name: /Resgatar a sobra/,
    });
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
    expect(await achar(/Saldo excedente devolvido/)).toBeTruthy();
  });

  test("apolice que a rede nao conhece mostra o erro", async () => {
    const { lerApolice } = await import("../../../interface/src/cadeia/contratos.js");
    lerApolice.mockRejectedValueOnce(new Error("could not decode result data"));

    await abrir(`/apolice/${ENDERECO}`, {
      perfil: "produtor",
      rotas: rotasDaApolice(),
    });
    expect(await achar("Nao foi possivel ler a apolice.")).toBeTruthy();
  });
});

test("rede incorreta bloqueia deposito, resgate e cancelamento", async () => {
  cadeia.apolice = apolice({ situacao: 0, garantiaRetida: 0n, instanteHistorico: INICIO - 1 });
  carteiraFalsa(CONTA_DA_SEGURADORA, { chainId: 1 });
  await abrir(`/apolice/${ENDERECO}`, { perfil: "seguradora", rotas: rotasDaApolice() });
  expect(await achar(/Selecione a rede Sepolia/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Depositar/ }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Cancelar apolice" }).disabled).toBe(true);
  expect(cadeia.chamadas).toEqual([]);
});

test("tempo atual nao libera resgate enquanto o relogio historico nao terminou", async () => {
  cadeia.apolice = apolice({ instanteHistorico: INICIO });
  carteiraFalsa(CONTA_DA_SEGURADORA);
  await abrir(`/apolice/${ENDERECO}`, { perfil: "seguradora", rotas: rotasDaApolice() });
  expect(await achar(/Aguarde o oraculo concluir/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Resgatar garantia" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancelar apolice" })).toBeNull();
});

test("publicacao final sem gatilho libera resgate mesmo com datas historicas", async () => {
  cadeia.apolice = apolice({ instanteHistorico: FIM + 1 });
  carteiraFalsa(CONTA_DA_SEGURADORA);
  await abrir(`/apolice/${ENDERECO}`, { perfil: "seguradora", rotas: rotasDaApolice() });
  const botao = await screen.findByRole("button", { name: "Resgatar garantia" });
  await waitFor(() => expect(botao.disabled).toBe(false));
  fireEvent.click(botao);
  expect(await achar(/Garantia devolvida/)).toBeTruthy();
  expect(cadeia.chamadas[0][0]).toBe("resgatarGarantia");
});

test("cancelada sem deposito usa texto condicional e nao afirma devolucao realizada", async () => {
  cadeia.apolice = apolice({ situacao: 4, garantiaRetida: 0n, totalPeriodos: 0 });
  await abrir(`/apolice/${ENDERECO}`, { perfil: "seguradora", rotas: rotasDaApolice() });
  expect(await achar(/Se houve depósito, a garantia foi devolvida/)).toBeTruthy();
  expect(screen.queryByText(/a garantia voltou a seguradora/)).toBeNull();
  expect(screen.queryByRole("button", { name: /Depositar/ })).toBeNull();
});

test("atualizacao manual rele o estado sem solicitar transacao", async () => {
  cadeia.apolice = apolice({ situacao: 0, garantiaRetida: 0n, totalPeriodos: 0 });
  await abrir(`/apolice/${ENDERECO}`, { perfil: "seguradora", rotas: rotasDaApolice() });
  expect(await achar(/Aguardando a seguradora depositar/)).toBeTruthy();
  expect(screen.queryByText("Nao ha acoes pendentes nesta apolice.")).toBeNull();
  const atualizar = await screen.findByRole("button", { name: "Atualizar" });
  await waitFor(() => expect(atualizar.disabled).toBe(false));
  cadeia.apolice = apolice({ situacao: 4, garantiaRetida: 0n, totalPeriodos: 0 });
  fireEvent.click(atualizar);
  expect(await achar(/Cancelada antes da primeira publicação histórica/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Depositar/ })).toBeNull();
  expect(cadeia.chamadas).toEqual([]);
});
