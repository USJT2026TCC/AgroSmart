/**
 * Telas do produtor: apolices, carteira, conta e avisos.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CONTA_DO_PRODUTOR, USUARIOS, abrir, achar, carteiraFalsa } from "../fixtures/ambiente.jsx";

afterEach(() => {
  // Desmonta antes de remover a carteira: a tela tira os ouvintes ao sair.
  cleanup();
  delete window.ethereum;
  localStorage.clear();
});

const APOLICE = "0x00000000000000000000000000000000000a9011";

describe("minhas apolices", () => {
  test("lista propostas em andamento e apolices, com o valor recebido", async () => {
    await abrir("/produtor", {
      perfil: "produtor",
      rotas: {
        "GET /propostas": {
          propostas: [
            {
              id: "p1",
              situacao: "preparada",
              talhao: { identificador: "talhao-01" },
              produto: { nome: "Estiagem — soja" },
              valorIndenizacaoWei: "1000000000000000000",
            },
            {
              id: "p2",
              situacao: "emitida",
              talhao: { identificador: "talhao-01" },
              produto: { nome: "x" },
              valorIndenizacaoWei: "1",
            },
          ],
        },
        "GET /apolices": {
          apolices: [
            {
              endereco: APOLICE,
              talhao: "talhao-01",
              cultura: "soja",
              situacao: 2,
              valorIndenizacaoWei: "10000000000000000",
              valorPagoWei: "10000000000000000",
              emitidaEm: "2026-10-07T00:00:00Z",
              produtor: { carteira: CONTA_DO_PRODUTOR },
            },
          ],
        },
      },
    });

    expect(await achar("Aguardando emissão")).toBeTruthy();
    expect(await achar(/Recebeu 0,01 ETH/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver detalhes" }).getAttribute("href")).toBe(
      `/apolice/${APOLICE}`,
    );
  });

  test("apolice liquidada sem saque mostra a indenizacao pendente", async () => {
    await abrir("/produtor", {
      perfil: "produtor",
      rotas: {
        "GET /propostas": { propostas: [] },
        "GET /apolices": {
          apolices: [
            {
              endereco: APOLICE,
              talhao: "talhao-01",
              cultura: "soja",
              situacao: 2,
              valorIndenizacaoWei: "10000000000000000",
              valorPagoWei: "0",
              emitidaEm: "2026-10-07T00:00:00Z",
              produtor: { carteira: CONTA_DO_PRODUTOR },
            },
          ],
        },
      },
    });

    expect(await achar(/saque pendente/)).toBeTruthy();
    expect(screen.queryByText(/Recebeu/)).toBeNull();
  });

  test("sem carteira vinculada, avisa e aponta a tela de vinculo", async () => {
    await abrir("/produtor", {
      perfil: "produtor",
      rotas: {
        "GET /autenticacao/eu": {
          usuario: { ...USUARIOS.produtor, carteira: null },
        },
        "GET /propostas": { propostas: [] },
        "GET /apolices": { apolices: [] },
      },
    });

    expect(await achar("Falta vincular sua carteira.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vincular carteira" }).getAttribute("href")).toBe(
      "/produtor/carteira",
    );
  });
});

describe("minha carteira", () => {
  test("sem extensao no navegador, explica o que instalar", async () => {
    await abrir("/produtor/carteira", { perfil: "produtor" });
    expect(await achar("Nenhuma carteira encontrada no navegador.")).toBeTruthy();
  });

  test("vincula assinando o desafio do servidor, sem expor a chave", async () => {
    const outra = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    const ethereum = carteiraFalsa(outra);

    const { chamadas } = await abrir("/produtor/carteira", {
      perfil: "produtor",
      rotas: {
        "POST /carteira/desafio": {
          desafioId: "d1",
          mensagem: "AgroSmart: vincular carteira\nnonce 42",
        },
        "POST /carteira/vincular": { ok: true },
      },
    });

    expect(await achar("A carteira conectada é outra.")).toBeTruthy();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Assinar e vincular esta carteira",
      }),
    );

    expect(await achar(/Titularidade comprovada/)).toBeTruthy();
    const vinculo = chamadas.find((c) => c.caminho === "/carteira/vincular");
    expect(vinculo.corpo.desafioId).toBe("d1");
    expect(vinculo.corpo.endereco.toLowerCase()).toBe(outra.toLowerCase());
    expect(ethereum.pedidos.some((p) => p.method === "personal_sign")).toBe(true);
  });

  test("carteira conectada e a vinculada; desvincular chama o servidor", async () => {
    carteiraFalsa(CONTA_DO_PRODUTOR);
    const { chamadas } = await abrir("/produtor/carteira", {
      perfil: "produtor",
      rotas: { "DELETE /carteira": { status: 204, corpo: null } },
    });

    expect(await achar("Esta é a carteira vinculada ao seu cadastro.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desvincular" }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.metodo === "DELETE" && c.caminho === "/carteira")).toBe(true),
    );
  });

  test("carteira em outra rede oferece a troca", async () => {
    const ethereum = carteiraFalsa(CONTA_DO_PRODUTOR, { chainId: 1 });
    await abrir("/produtor/carteira", { perfil: "produtor" });

    // O cabecalho tambem oferece a troca; o da pagina e o ultimo.
    const botoes = await screen.findAllByRole("button", {
      name: /Trocar para/,
    });
    fireEvent.click(botoes.at(-1));
    await waitFor(() =>
      expect(ethereum.pedidos.some((p) => p.method === "wallet_switchEthereumChain")).toBe(true),
    );
  });
});

describe("minha conta", () => {
  test("mostra os dados do perfil fixo, sem configurar segundo fator", async () => {
    await abrir("/conta", { perfil: "seguradora" });
    expect(await achar("Marina Costa")).toBeTruthy();
    expect(screen.getByText("Seguradora", { selector: "div" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Configurar segundo fator" })).toBeNull();
    expect(screen.queryByText("Segundo fator")).toBeNull();
  });
});

describe("avisos", () => {
  test("lista, marca uma e marca todas como lidas", async () => {
    const lista = {
      notificacoes: [
        {
          id: 1,
          titulo: "Indenizacao paga",
          mensagem: "0,01 ETH transferidos.",
          criada_em: "2026-10-07T12:00:00Z",
          apolice_endereco: APOLICE,
          tx_hash: `0x${"ab".repeat(32)}`,
          lida_em: null,
        },
        {
          id: 2,
          titulo: "Cobertura ativa",
          mensagem: "Garantia depositada.",
          criada_em: "2026-10-06T12:00:00Z",
          lida_em: "2026-10-06T13:00:00Z",
        },
      ],
      naoLidas: 1,
    };
    const { chamadas } = await abrir("/notificacoes", {
      perfil: "produtor",
      rotas: {
        "GET /notificacoes": lista,
        "POST /notificacoes/:id/lida": { ok: true },
        "POST /notificacoes/lidas": { ok: true },
      },
    });

    expect(await achar("Indenizacao paga")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver apolice" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Marcar como lida" }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.caminho === "/notificacoes/1/lida")).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "Marcar todas como lidas" }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.caminho === "/notificacoes/lidas")).toBe(true),
    );
  });

  test("sem avisos, diz isso", async () => {
    await abrir("/notificacoes", { perfil: "produtor" });
    expect(await achar("Nenhuma notificacao.")).toBeTruthy();
  });
});

test("talhoes do login aparecem com proximo passo, sem ofertar cultura sem produto", async () => {
  await abrir("/produtor", {
    perfil: "produtor",
    rotas: {
      "GET /apolices": { apolices: [] },
      "GET /propostas": { propostas: [] },
      "GET /talhoes": {
        talhoes: [
          {
            id: "t1",
            identificador: "soja-ana",
            cultura: "soja",
            areaHa: 12,
            propriedade: { nome: "Santa Clara", municipio: "Sao Simao/SP" },
          },
          {
            id: "t2",
            identificador: "cana-ana",
            cultura: "cana",
            areaHa: 3,
            propriedade: { nome: "Santa Clara", municipio: "Sao Simao/SP" },
          },
        ],
      },
      "GET /produtos": { produtos: [{ id: "p1", cultura: "soja", ativo: true }] },
    },
  });
  expect(
    (await screen.findByRole("link", { name: "Solicitar proposta para soja-ana" })).getAttribute(
      "href",
    ),
  ).toBe("/produtor/cotacao?talhao=t1");
  expect(screen.getByText("Fora do escopo da demonstração")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Solicitar proposta para cana/ })).toBeNull();
});

test("talhao com proposta em analise mostra a situacao em vez do botao", async () => {
  await abrir("/produtor", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": {
        talhoes: [
          {
            id: "t1",
            identificador: "soja-ana",
            cultura: "soja",
            areaHa: 12,
            propriedade: { nome: "Santa Clara", municipio: "Sao Simao/SP" },
          },
        ],
      },
      "GET /produtos": { produtos: [{ id: "p1", cultura: "soja", ativo: true }] },
      "GET /propostas": {
        propostas: [
          {
            id: "x",
            situacao: "pendente",
            talhao: { id: "t1", identificador: "soja-ana" },
            termos: { limiarClimatico: 10 },
            criadaEm: "2026-10-25T12:00:00Z",
            valorIndenizacaoWei: "6000000000000000",
          },
        ],
      },
    },
  });
  expect(await achar("Proposta em análise")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Solicitar proposta/ })).toBeNull();
  expect(screen.getByText("10 dias secos")).toBeTruthy();
});
