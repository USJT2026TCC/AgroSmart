/**
 * Telas da seguradora: propostas e emissao, oraculos,
 * fontes, carteira e relatorio, talhoes e produtos (RF04,
 * RF08 a RF11, RF17).
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CONTA_DA_SEGURADORA, abrir, achar, carteiraFalsa } from "./ambiente.jsx";

const TX = `0x${"12".repeat(32)}`;
const transacao = () => ({
  hash: TX,
  wait: vi.fn(async () => ({ status: 1 })),
});

const cadeia = vi.hoisted(() => ({
  seguradora: null,
  situacao: 0n,
  oraculos: [],
  chamadas: [],
}));

vi.mock("../../../interface/src/cadeia/contratos.js", () => ({
  contratoFactory: vi.fn(() => ({
    seguradora: async () => cadeia.seguradora,
    emitirApoliceHistorica: vi.fn(async (termos) => {
      cadeia.chamadas.push(["emitirApolice", termos]);
      return transacao();
    }),
  })),
  contratoApolice: vi.fn((endereco) => ({
    situacao: async () => cadeia.situacao,
    depositarGarantia: vi.fn(async (opcoes) => {
      cadeia.chamadas.push(["depositarGarantia", endereco, opcoes.value]);
      return transacao();
    }),
  })),
  contratoRegistry: vi.fn(() => ({
    seguradora: async () => cadeia.seguradora,
    ehAutorizado: async () => true,
    autorizar: vi.fn(async (e) => {
      cadeia.chamadas.push(["autorizar", e]);
      return transacao();
    }),
    revogar: vi.fn(async (e) => {
      cadeia.chamadas.push(["revogar", e]);
      return transacao();
    }),
  })),
  listarOraculos: vi.fn(async () => cadeia.oraculos),
}));

afterEach(() => {
  cleanup();
  delete window.ethereum;
  localStorage.clear();
  cadeia.chamadas.length = 0;
  cadeia.seguradora = CONTA_DA_SEGURADORA;
  cadeia.situacao = 0n;
});

cadeia.seguradora = CONTA_DA_SEGURADORA;

const PROPOSTA = {
  id: "p1",
  situacao: "pendente",
  produtor: { nome: "Joao Ribeiro" },
  carteiraProdutor: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  talhao: { identificador: "talhao-01", cultura: "soja" },
  produto: { nome: "Estiagem — soja" },
  termos: { limiarClimatico: 30 },
  valorIndenizacaoWei: "1080000000000000000",
  criadaEm: "2026-10-25T12:00:00Z",
  hashTermos: null,
  apolice: null,
};

describe("propostas e emissao", () => {
  test("sem carteira, a emissao fica bloqueada e o motivo aparece", async () => {
    await abrir("/seguradora/propostas", {
      perfil: "seguradora",
      rotas: { "GET /propostas": { propostas: [PROPOSTA] } },
    });

    expect(await achar("Carteira não conectada.")).toBeTruthy();
    expect((await screen.findByRole("button", { name: "Aprovar e emitir apólice" })).disabled).toBe(
      true,
    );
  });

  test("emite: o servidor prepara, a carteira assina, o servidor confere", async () => {
    carteiraFalsa(CONTA_DA_SEGURADORA);
    const { chamadas } = await abrir("/seguradora/propostas", {
      perfil: "seguradora",
      rotas: {
        "GET /propostas": { propostas: [PROPOSTA] },
        "POST /propostas/:id/preparar": {
          fabrica: "0x0000000000000000000000000000000000000020",
          termos: { produtor: "0x1" },
          hashTermos: `0x${"ab".repeat(32)}`,
          descricaoDosTermos: "x",
        },
        "POST /propostas/:id/emissao": {
          apolice: { endereco: "0x00000000000000000000000000000000000a9011" },
        },
      },
    });

    const botao = await screen.findByRole("button", {
      name: "Aprovar e emitir apólice",
    });
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);

    expect(await achar(/Apólice emitida e conferida/)).toBeTruthy();
    expect(cadeia.chamadas[0][0]).toBe("emitirApolice");
    expect(chamadas.find((c) => c.caminho === "/propostas/p1/emissao").corpo.txHash).toBe(TX);
  });

  test("deposita a garantia de uma apolice emitida sem lastro", async () => {
    carteiraFalsa(CONTA_DA_SEGURADORA);
    const emitida = {
      ...PROPOSTA,
      situacao: "emitida",
      hashTermos: `0x${"ab".repeat(32)}`,
      apolice: {
        endereco: "0x00000000000000000000000000000000000a9011",
        txEmissao: TX,
      },
    };
    await abrir("/seguradora/propostas", {
      perfil: "seguradora",
      rotas: { "GET /propostas": { propostas: [emitida] } },
    });

    const botao = await screen.findByRole("button", { name: /Depositar/ });
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);

    expect(await achar(/A apólice está ativa/)).toBeTruthy();
    expect(cadeia.chamadas[0]).toEqual([
      "depositarGarantia",
      emitida.apolice.endereco,
      1080000000000000000n,
    ]);
  });

  test("carteira que nao e a seguradora da fabrica e avisada", async () => {
    carteiraFalsa("0x90F79bf6EB2c4f870365E785982E1f101E93b906");
    await abrir("/seguradora/propostas", {
      perfil: "seguradora",
      rotas: { "GET /propostas": { propostas: [] } },
    });

    expect(await achar("A conta selecionada na MetaMask não é a da seguradora.")).toBeTruthy();
    expect(await achar("Nenhuma proposta recebida ainda.")).toBeTruthy();
  });

  test("recusar pede confirmacao e chama o servidor", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { chamadas } = await abrir("/seguradora/propostas", {
      perfil: "seguradora",
      rotas: {
        "GET /propostas": { propostas: [PROPOSTA] },
        "POST /propostas/:id/recusar": { ok: true },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.caminho === "/propostas/p1/recusar")).toBe(true),
    );
    expect(confirmar).toHaveBeenCalled();
    confirmar.mockRestore();
  });

  test("propostas recusadas ficam recolhidas, depois das que pedem acao", async () => {
    await abrir("/seguradora/propostas", {
      perfil: "seguradora",
      rotas: {
        "GET /propostas": {
          propostas: [
            {
              ...PROPOSTA,
              id: "r1",
              situacao: "recusada",
              talhao: { identificador: "antigo", cultura: "soja" },
            },
            PROPOSTA,
          ],
        },
      },
    });
    expect(await achar("Recusadas (1)")).toBeTruthy();
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos[0]).toMatch(/talhao-01/);
  });
});

describe("oraculos autorizados", () => {
  test("painel une sincronizacao, saldo, oraculo e contratos num cartao so", async () => {
    await abrir("/seguradora", {
      perfil: "seguradora",
      rotas: {
        "GET /relatorios/carteira": RELATORIO,
        "GET /apolices": { apolices: [] },
        "GET /saude": { indexador: { ativo: true, ultimoErro: null } },
      },
    });
    const cartao = await screen.findByRole("region", { name: "Blockchain" });
    expect(within(cartao).getByText("Sincronização com a Sepolia ativa")).toBeTruthy();
    expect(within(cartao).getByText("Saldo da seguradora")).toBeTruthy();
    expect(await within(cartao).findByText("autorizado")).toBeTruthy();
    expect(within(cartao).getByText("Fábrica de apólices")).toBeTruthy();
    expect(within(cartao).getByText("Registro de oráculos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Atualizar dados" })).toBeNull();
    expect(screen.queryByText("Contratos na Sepolia, para conferência")).toBeNull();
  });
});

const RELATORIO = {
  carteira: {
    apolices: 2,
    ativas: 1,
    aguardando_garantia: 0,
    liquidadas: 1,
    encerradas: 0,
    canceladas: 0,
    taxaDeAcionamento: 0.5,
    limite_total_wei: "2000000000000000000",
    pago_total_wei: "1000000000000000000",
  },
  publicacoes: { total: 3, latencia_media_ms: 170 },
  propostasPendentes: 1,
};

describe("carteira e relatorio", () => {
  test("indicadores, linha de resumo e painel sem filtro", async () => {
    await abrir("/seguradora", {
      perfil: "seguradora",
      rotas: {
        "GET /relatorios/carteira": RELATORIO,
        "GET /apolices": {
          apolices: [
            {
              endereco: "0xa1",
              talhao: "talhao-01",
              cultura: "soja",
              produtor: { nome: "Joao", carteira: "0x1" },
              emitidaEm: "2026-10-01T00:00:00Z",
              valorIndenizacaoWei: "1",
              valorPagoWei: "0",
              situacao: 1,
            },
          ],
        },
        "GET /saude": {
          banco: { motor: "postgres" },
          indexador: { ativo: true, ultimoErro: { mensagem: "no fora do ar" } },
        },
      },
    });

    expect(await achar("Visão geral dos seguros")).toBeTruthy();
    expect(await achar("Proposta aguardando emissão")).toBeTruthy();
    expect(await achar("Sincronização com a Sepolia indisponível")).toBeTruthy();
    expect(
      await achar("0 cancelada(s) · 0 encerrada(s) · 50% das apólices com indenização paga."),
    ).toBeTruthy();
    expect(screen.queryByText("Filtrar apólices", { exact: true })).toBeNull();
  });
});

describe("painel sem apolices", () => {
  const vazio = {
    ...RELATORIO,
    propostasPendentes: 4,
    carteira: { ...RELATORIO.carteira, apolices: 0, ativas: 0, liquidadas: 0 },
  };
  test("orienta os proximos passos e nao mostra indicadores e filtros vazios", async () => {
    await abrir("/seguradora", {
      perfil: "seguradora",
      rotas: {
        "GET /relatorios/carteira": vazio,
        "GET /apolices": { apolices: [] },
        "GET /saude": { indexador: { ativo: true, ultimoErro: null } },
      },
    });
    expect(await achar("Sua primeira apólice começa com uma proposta")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Analisar propostas →" }).getAttribute("href")).toBe(
      "/seguradora/propostas",
    );
    expect(screen.queryByText("Cobertura contratada")).toBeNull();
    expect(screen.queryByText("Filtrar apólices", { exact: true })).toBeNull();
    expect(screen.getByText("Sincronização com a Sepolia ativa")).toBeTruthy();
  });
  test("falha inicial mostra erro com tentativa de atualizar, sem ficar carregando", async () => {
    await abrir("/seguradora", {
      perfil: "seguradora",
      rotas: {
        "GET /relatorios/carteira": {
          status: 503,
          corpo: { erro: { mensagem: "Serviço indisponível" } },
        },
        "GET /apolices": { apolices: [] },
        "GET /saude": { indexador: { ativo: true } },
      },
    });
    expect(await achar("Não foi possível atualizar o painel.")).toBeTruthy();
    expect(screen.queryByText("Carregando seus seguros…")).toBeNull();
    expect(screen.getByRole("button", { name: "Tentar novamente" }).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Atualizar dados" })).toBeNull();
  });
});

describe("talhoes, produtores e produtos", () => {
  const TALHAO = {
    id: "t1",
    identificador: "talhao-01",
    cultura: "soja",
    areaHa: "459.05",

    propriedade: {
      id: "pp1",
      nome: "Fazenda Santa Clara",
      municipio: "Sao Simao/SP",
    },
    produtor: { id: "u1", nome: "Joao Ribeiro" },
    fontesAtivas: 1,
    atendeMinimoDeFontes: false,
  };

  function rotasBase(extra = {}) {
    return {
      "GET /talhoes": { talhoes: [TALHAO] },
      "GET /produtos": {
        produtos: [
          {
            id: "pr1",
            nome: "Estiagem — soja",
            cultura: "soja",
            limiarClimatico: 30,
            valorIndenizacaoEth: "0.006",
            vigenciaDias: 180,
            ativo: true,
          },
        ],
      },
      "GET /produtores": {
        produtores: [
          {
            id: "u1",
            identificador: "produtor",
            nome: "Joao Ribeiro",
            documento: "123",
          },
        ],
      },
      "GET /propriedades": {
        propriedades: [
          {
            id: "pp1",
            nome: "Fazenda Santa Clara",
            municipio: "Sao Simao/SP",
            produtor_nome: "Joao Ribeiro",
            produtor_id: "u1",
            talhoes: 1,
          },
        ],
      },
      ...extra,
    };
  }

  test("tela unica: produto fixo no topo e formulario sem campos de produtor ou cultura", async () => {
    await abrir("/seguradora/talhoes", { perfil: "seguradora", rotas: rotasBase() });
    expect(await screen.findByRole("heading", { name: "Novo talhão" })).toBeTruthy();
    expect(screen.getByText("Estiagem — soja")).toBeTruthy();
    expect(screen.getByText("Produto fixo da demonstração")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Seguradora · Marina Costa" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Salvar produto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Novo produtor" })).toBeNull();
    expect(screen.queryByLabelText("Identificador de acesso")).toBeNull();
    expect(screen.queryByLabelText(/Cultura/)).toBeNull();
    expect(screen.getByText(/cultura soja · São Simão\/SP \(estação INMET A770\)/)).toBeTruthy();
    expect(screen.getByText("INMET, 01/01/2020 a 31/12/2024")).toBeTruthy();
  });

  test("cadastra reaproveitando a propriedade e envia area cadastral", async () => {
    const { chamadas } = await abrir("/seguradora/talhoes", {
      perfil: "seguradora",
      rotas: rotasBase({
        "POST /talhoes": { talhao: { identificador: "talhao-09", areaHa: "12.5" } },
      }),
    });
    const propriedade = await screen.findByLabelText("Propriedade");
    expect(propriedade.value).toBe("pp1");
    fireEvent.change(screen.getByLabelText("Identificação do talhão"), {
      target: { value: "talhao-09" },
    });
    fireEvent.change(screen.getByLabelText("Área (ha)"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar talhão" }));
    expect(await achar(/Talhão talhao-09 cadastrado/)).toBeTruthy();
    const corpo = chamadas.find((c) => c.caminho === "/talhoes" && c.metodo === "POST").corpo;
    expect(corpo).toMatchObject({
      produtorId: "u1",
      propriedadeId: "pp1",
      areaHa: "12.5",
      cultura: "soja",
    });
  });

  test("nova propriedade vai com o municipio fixo", async () => {
    const { chamadas } = await abrir("/seguradora/talhoes", {
      perfil: "seguradora",
      rotas: rotasBase({ "POST /talhoes": { talhao: { identificador: "t-novo", areaHa: "3" } } }),
    });
    fireEvent.change(await screen.findByLabelText("Propriedade"), { target: { value: "nova" } });
    fireEvent.change(screen.getByLabelText("Nome da nova propriedade"), {
      target: { value: "Fazenda Nova" },
    });
    fireEvent.change(screen.getByLabelText("Identificação do talhão"), {
      target: { value: "t-novo" },
    });
    fireEvent.change(screen.getByLabelText("Área (ha)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar talhão" }));
    await achar(/Talhão t-novo cadastrado/);
    const corpo = chamadas.find((c) => c.caminho === "/talhoes" && c.metodo === "POST").corpo;
    expect(corpo.propriedade).toEqual({ nome: "Fazenda Nova", municipio: "São Simão/SP" });
    expect(corpo.propriedadeId).toBeUndefined();
  });

  test("remove talhao com confirmacao, sem editar area", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { chamadas } = await abrir("/seguradora/talhoes", {
      perfil: "seguradora",
      rotas: rotasBase({ "DELETE /talhoes/:id": { status: 204, corpo: null } }),
    });
    await screen.findByRole("button", { name: "Remover" });
    expect(screen.queryByRole("button", { name: "Editar área" })).toBeNull();
    expect(screen.queryByText("Gatilho sugerido")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(true));
    expect(confirmar).toHaveBeenCalled();
    confirmar.mockRestore();
  });
});

test("proposta com a carteira da seguradora como beneficiaria fica bloqueada com explicacao", async () => {
  carteiraFalsa(CONTA_DA_SEGURADORA);
  await abrir("/seguradora/propostas", {
    perfil: "seguradora",
    rotas: {
      "GET /propostas": {
        propostas: [
          {
            id: "p9",
            situacao: "pendente",
            produtor: { nome: "Joao Ribeiro" },
            carteiraProdutor: CONTA_DA_SEGURADORA.toLowerCase(),
            talhao: { identificador: "talhao-09", cultura: "soja" },
            produto: { nome: "Estiagem — soja" },
            termos: { limiarClimatico: 10 },
            valorIndenizacaoWei: "6000000000000000",
            criadaEm: "2026-10-25T12:00:00Z",
            hashTermos: null,
            apolice: null,
          },
        ],
      },
    },
  });
  expect(await achar("Esta proposta não pode ser emitida.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Aprovar e emitir apólice" }).disabled).toBe(true);
});

test("menu da seguradora sem aba de oraculos; passo a passo leva ao oraculo autorizado", async () => {
  await abrir("/seguradora/talhoes", {
    perfil: "seguradora",
    rotas: {
      "GET /talhoes": { talhoes: [] },
      "GET /produtores": { produtores: [] },
      "GET /propriedades": { propriedades: [] },
    },
  });
  const nav = await screen.findByRole("navigation");
  expect(within(nav).queryByRole("link", { name: /Oráculos/ })).toBeNull();
  expect(screen.queryByText("Renomear propriedades")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Como funciona/ }));
  const ajuda = await screen.findByRole("region", { name: "Como funciona" });
  expect(within(ajuda).getAllByRole("listitem")).toHaveLength(5);
  expect(within(ajuda).getByRole("link", { name: "Painel" }).getAttribute("href")).toBe(
    "/seguradora",
  );

  fireEvent.click(within(ajuda).getByRole("button", { name: "Fechar" }));
  expect(screen.queryByRole("region", { name: "Como funciona" })).toBeNull();
});

test("API e interface com fabricas diferentes bloqueiam assinatura", async () => {
  cadeia.seguradora = CONTA_DA_SEGURADORA;
  cadeia.chamadas.length = 0;
  carteiraFalsa(CONTA_DA_SEGURADORA);
  await abrir("/seguradora/propostas", {
    perfil: "seguradora",
    rotas: {
      "GET /propostas": { propostas: [PROPOSTA] },
      "POST /propostas/:id/preparar": {
        fabrica: "0x0000000000000000000000000000000000000099",
        termos: {},
        hashTermos: `0x${"ab".repeat(32)}`,
      },
    },
  });
  const botao = await screen.findByRole("button", { name: "Aprovar e emitir apólice" });
  await waitFor(() => expect(botao.disabled).toBe(false));
  fireEvent.click(botao);
  expect(await achar(/fabrica informada pela API difere/)).toBeTruthy();
  expect(cadeia.chamadas).toEqual([]);
});
