/**
 * Cotacao com historico climatico (RF06, RNF04, HU10).
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
  propriedade: { id: "pp1", nome: "Fazenda Boa Vista" },
  poligono: {
    type: "Polygon",
    coordinates: [
      [
        [-47.59, -21.45],
        [-47.57, -21.45],
        [-47.57, -21.47],
        [-47.59, -21.47],
        [-47.59, -21.45],
      ],
    ],
  },
};

const PRODUTO = {
  id: "pr1",
  nome: "Estiagem experimental — soja",
  cultura: "soja",
  modoPagamento: 0,
  limiarClimatico: 30,
  limiarClimaticoIntegral: 0,
  valorPorHectareEth: "0.006",
  taxaPremioBps: 380,
  vigenciaDias: 180,
};

const HISTORICO = {
  aplicavel: true,
  estacoes: ["A747", "A770"],
  regra: "1 mm de chuva por dia; dia sem medicao interrompe a contagem",
  observacao: "Anos com menos de 90% dos dias medidos ficam fora da conta.",
  anos: [
    {
      ano: 2023,
      maiorIndice: 36,
      coberturaDosDados: 1,
      avaliado: true,
      acionaria: true,
      percentualBps: 10000,
    },
    {
      ano: 2024,
      maiorIndice: 18,
      coberturaDosDados: 1,
      avaliado: true,
      acionaria: false,
      percentualBps: 0,
    },
    {
      ano: 2025,
      maiorIndice: 15,
      coberturaDosDados: 0.4,
      avaliado: false,
      acionaria: false,
      percentualBps: 0,
    },
  ],
  anosAvaliados: 2,
  acionamentos: 1,
  frequencia: 0.5,
  pagamentoMedioBps: 5000,
};

describe("cotacao e contratacao (RF06, RNF04, HU10)", () => {
  test("mostra limite, premio, exemplos do que aciona e o historico da localidade, e envia a proposta", async () => {
    const { chamadas } = await abrir("/produtor/cotacao", {
      perfil: "produtor",
      rotas: {
        "GET /talhoes": { talhoes: [TALHAO] },
        "GET /produtos": { produtos: [PRODUTO] },
        "POST /cotacoes": {
          cotacao: {
            areaSeguradaHa: "180",
            valorIndenizacaoWei: "1080000000000000000",
            premioWei: "41040000000000000",
            termos: PRODUTO,
            historico: HISTORICO,
          },
        },
        "POST /propostas": {
          status: 201,
          corpo: { proposta: { id: "p1", situacao: "pendente" } },
        },
      },
    });

    fireEvent.change(await screen.findByLabelText("Produto"), {
      target: { value: "pr1" },
    });

    expect(await achar(/teria acionado em/)).toBeTruthy();
    expect(await achar(/sem dados suficientes/)).toBeTruthy();
    expect(screen.getAllByText("Sim").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Inicio da cobertura"), {
      target: { value: "2026-11-01" },
    });
    await waitFor(() =>
      expect(
        chamadas.some(
          (c) =>
            c.caminho === "/cotacoes" &&
            c.corpo.inicioDaVigencia === "2026-11-01",
        ),
      ).toBe(true),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Enviar proposta a seguradora",
      }),
    );
    await waitFor(() =>
      expect(
        chamadas.some(
          (c) =>
            c.caminho === "/propostas" &&
            c.corpo.inicioDaVigencia === "2026-11-01",
        ),
      ).toBe(true),
    );
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
          cotacao: {
            areaSeguradaHa: "180",
            valorIndenizacaoWei: "1",
            premioWei: "1",
            termos: PRODUTO,
            historico: HISTORICO,
          },
        },
      },
    });

    fireEvent.change(await screen.findByLabelText("Produto"), {
      target: { value: "pr1" },
    });
    expect(
      (
        await screen.findByRole("button", {
          name: "Enviar proposta a seguradora",
        })
      ).disabled,
    ).toBe(true);
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
          areaSeguradaHa: "1",
          valorIndenizacaoWei: "100",
          premioWei: "1",
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
        corpo: { proposta: { id: "historica", situacao: "pendente" } },
      },
    },
  });
  fireEvent.click(
    await screen.findByRole("checkbox", { name: /Usar dados historicos/ }),
  );
  fireEvent.change(screen.getByLabelText("Gatilho experimental (dias secos)"), {
    target: { value: "10" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Analisar periodo no banco" }),
  );
  expect(await achar(/Acionaria em 2024-07-11/)).toBeTruthy();
  expect(
    chamadas.find((c) => c.caminho === "/historico/avaliar").corpo,
  ).toEqual({ inicio: "2024-02-07", fim: "2025-02-07", gatilho: 10 });
  fireEvent.change(screen.getByLabelText("Produto"), {
    target: { value: "pr1" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Enviar proposta a seguradora" })
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar proposta a seguradora" }),
  );
  await waitFor(() =>
    expect(
      chamadas.some(
        (c) =>
          c.caminho === "/propostas" &&
          c.corpo.reproducaoHistorica === true &&
          c.corpo.gatilhoDias === 10 &&
          c.corpo.fimDaVigencia === "2025-02-07",
      ),
    ).toBe(true),
  );
});
