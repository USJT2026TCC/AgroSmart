/**
 * Cotacao com historico climatico.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { USUARIOS, abrir, achar } from "./ambiente.jsx";

afterEach(() => {
  cleanup();
});

const TALHAO = {
  id: "t1",
  identificador: "talhao-01",
  cultura: "soja",
  areaHa: "459.05",
  propriedade: { id: "pp1", nome: "Fazenda Boa Vista", municipio: "Sao Simao/SP" },
};

const PRODUTO = {
  id: "pr1",
  nome: "Estiagem experimental — soja",
  cultura: "soja",
  limiarClimatico: 30,
  valorIndenizacaoEth: "0.006",
  vigenciaDias: 180,
};

const ENVIAR = "Enviar proposta à seguradora";
const GATILHO = "Gatilho (dias seguidos sem chuva)";

describe("cotacao e contratacao", () => {
  test("mostra cotacao historica e envia periodo e gatilho na proposta", async () => {
    const { chamadas } = await abrir("/produtor/cotacao", {
      perfil: "produtor",
      rotas: {
        "GET /talhoes": { talhoes: [TALHAO] },
        "GET /produtos": { produtos: [PRODUTO] },
        "POST /cotacoes": {
          cotacao: {
            valorIndenizacaoWei: "1080000000000000000",
            termos: PRODUTO,
          },
        },
        "POST /propostas": {
          status: 201,
          corpo: { proposta: { id: "p1", situacao: "pendente", talhao: { id: "t1" } } },
        },
      },
    });

    // Produto unico da demonstracao: vem escolhido, sem campo para selecionar.
    expect(await achar("Estiagem experimental — soja")).toBeTruthy();
    expect(screen.queryByLabelText("Produto")).toBeNull();
    expect(await achar(/Contratação hipotética/)).toBeTruthy();
    expect(await achar(/dados do INMET, estação A770/)).toBeTruthy();

    await waitFor(() =>
      expect(
        chamadas.some(
          (c) =>
            c.caminho === "/cotacoes" &&
            c.corpo.fimDaVigencia === "2024-12-31" &&
            c.corpo.inicioDaVigencia === "2024-02-07",
        ),
      ).toBe(true),
    );
    fireEvent.change(screen.getByLabelText("Início da cobertura"), {
      target: { value: "2024-02-08" },
    });
    await waitFor(() =>
      expect(
        chamadas.some(
          (c) => c.caminho === "/cotacoes" && c.corpo.inicioDaVigencia === "2024-02-08",
        ),
      ).toBe(true),
    );

    fireEvent.click(await screen.findByRole("button", { name: ENVIAR }));
    await waitFor(() =>
      expect(
        chamadas.some(
          (c) =>
            c.metodo === "POST" &&
            c.caminho === "/propostas" &&
            c.corpo.inicioDaVigencia === "2024-02-08",
        ),
      ).toBe(true),
    );
    expect(await achar("Proposta enviada à seguradora.")).toBeTruthy();
  });

  test("sem carteira vinculada, nao deixa enviar a proposta", async () => {
    await abrir("/produtor/cotacao", {
      perfil: "produtor",
      rotas: {
        "GET /autenticacao/eu": {
          usuario: { ...USUARIOS.produtor, carteira: null },
        },
        "GET /talhoes": { talhoes: [TALHAO] },
        "GET /produtos": { produtos: [PRODUTO] },
        "POST /cotacoes": {
          cotacao: { valorIndenizacaoWei: "1", termos: PRODUTO },
        },
      },
    });

    expect((await screen.findByRole("button", { name: ENVIAR })).disabled).toBe(true);
  });
});

test("modo historico envia datas e gatilho escolhidos, sem transacao na consulta", async () => {
  const { chamadas } = await abrir("/produtor/cotacao", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": { talhoes: [TALHAO] },
      "GET /produtos": { produtos: [PRODUTO] },
      "POST /cotacoes": ({ corpo }) => ({
        cotacao: {
          valorIndenizacaoWei: "100",
          termos: { ...PRODUTO, limiarClimatico: corpo.gatilhoDias ?? 30 },
        },
      }),
      "POST /historico/avaliar": {
        resultado: {
          acionaria: true,
          primeiroAcionamento: "2024-07-11",
          maiorSequencia: 39,
          diasIncompletos: 0,
        },
      },
      "POST /propostas": {
        status: 201,
        corpo: { proposta: { id: "historica", situacao: "pendente", talhao: { id: "t1" } } },
      },
    },
  });
  fireEvent.change(await screen.findByLabelText(GATILHO), { target: { value: "10" } });
  fireEvent.click(await screen.findByRole("button", { name: "Ver o que aconteceu nesse período" }));
  expect(await achar(/acionado em 2024-07-11/)).toBeTruthy();
  expect(chamadas.find((c) => c.caminho === "/historico/avaliar").corpo).toEqual({
    inicio: "2024-02-07",
    fim: "2024-12-31",
    gatilho: 10,
  });
  await waitFor(() => expect(screen.getByRole("button", { name: ENVIAR }).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: ENVIAR }));
  await waitFor(() =>
    expect(
      chamadas.some(
        (c) =>
          c.metodo === "POST" &&
          c.caminho === "/propostas" &&
          c.corpo.gatilhoDias === 10 &&
          c.corpo.fimDaVigencia === "2024-12-31",
      ),
    ).toBe(true),
  );
});

test("oculta talhoes sem produto e seleciona o talhao solicitado entre os proprios", async () => {
  const outro = { ...TALHAO, id: "t2", identificador: "outro-soja" };
  await abrir("/produtor/cotacao?talhao=t2", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": { talhoes: [{ ...TALHAO, id: "cana", cultura: "cana" }, TALHAO, outro] },
      "GET /produtos": { produtos: [PRODUTO] },
    },
  });
  const select = await screen.findByLabelText("Talhão");
  expect(select.value).toBe("t2");
  expect([...select.options].map((o) => o.value)).toEqual(["t1", "t2"]);
});

test("sem produto compativel explica o proximo passo, sem formulario inutil", async () => {
  await abrir("/produtor/cotacao", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": { talhoes: [{ ...TALHAO, cultura: "cana" }] },
      "GET /produtos": { produtos: [PRODUTO] },
    },
  });
  expect(await achar("Nenhum talhão disponível para contratar.")).toBeTruthy();
  expect(screen.queryByLabelText("Talhão")).toBeNull();
});

test("produto retirado nao permite cotacao", async () => {
  await abrir("/produtor/cotacao", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": { talhoes: [TALHAO] },
      "GET /produtos": { produtos: [{ ...PRODUTO, ativo: false }] },
    },
  });
  expect(await achar("Nenhum talhão disponível para contratar.")).toBeTruthy();
});

test("talhao com proposta em analise nao recebe outra proposta", async () => {
  await abrir("/produtor/cotacao", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": { talhoes: [TALHAO] },
      "GET /produtos": { produtos: [PRODUTO] },
      "GET /propostas": {
        propostas: [{ id: "p1", situacao: "pendente", talhao: { id: "t1" } }],
      },
    },
  });
  expect(await achar("Sua proposta está em análise pela seguradora.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: ENVIAR })).toBeNull();
});

test("resposta atrasada de outra cotacao nao libera envio com parametros desatualizados", async () => {
  let responderAntiga;
  await abrir("/produtor/cotacao", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": { talhoes: [TALHAO] },
      "GET /produtos": { produtos: [PRODUTO] },
      "POST /cotacoes": ({ corpo }) =>
        corpo.gatilhoDias === 30
          ? new Promise((resolve) => {
              responderAntiga = resolve;
            })
          : { status: 400, corpo: { erro: { mensagem: "Período inválido para esta cotação." } } },
    },
  });
  await waitFor(() => expect(responderAntiga).toBeTypeOf("function"));
  fireEvent.change(screen.getByLabelText(GATILHO), { target: { value: "10" } });
  await achar("Período inválido para esta cotação.");
  await act(async () =>
    responderAntiga({ cotacao: { termos: PRODUTO, valorIndenizacaoWei: "1000" } }),
  );
  expect(screen.queryByRole("button", { name: ENVIAR })).toBeNull();
  expect(screen.getByText("Período inválido para esta cotação.")).toBeTruthy();
});

test("descarta analise antiga quando o gatilho muda durante a consulta", async () => {
  let concluir;
  const resposta = new Promise((resolve) => {
    concluir = resolve;
  });
  const { chamadas } = await abrir("/produtor/cotacao", {
    perfil: "produtor",
    rotas: {
      "GET /talhoes": { talhoes: [TALHAO] },
      "GET /produtos": { produtos: [PRODUTO] },
      "POST /cotacoes": { cotacao: { valorIndenizacaoWei: "6000000000000000", termos: PRODUTO } },
      "POST /historico/avaliar": () => resposta,
    },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Ver o que aconteceu nesse período" }));
  await waitFor(() => expect(chamadas.some((c) => c.caminho === "/historico/avaliar")).toBe(true));
  fireEvent.change(screen.getByLabelText(GATILHO), { target: { value: "15" } });
  await act(async () => {
    concluir({
      resultado: {
        acionaria: true,
        primeiroAcionamento: "2024-07-11",
        maiorSequencia: 39,
        diasIncompletos: 0,
      },
    });
  });
  expect(screen.queryByText(/acionado em 2024-07-11/)).toBeNull();
});
