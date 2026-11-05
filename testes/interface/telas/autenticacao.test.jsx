/**
 * Entrada, segundo fator, perfis e sessao expirada.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  CONTA_DA_SEGURADORA,
  CONTA_DO_PRODUTOR,
  USUARIOS,
  abrir,
  achar,
  carteiraFalsa,
} from "../fixtures/ambiente.jsx";

vi.mock("../../../interface/src/cadeia/contratos.js", () => ({
  listarApolices: vi.fn(async () => []),
  resumirCarteira: vi.fn(() => ({
    total: 0,
    ativas: 0,
    liquidadas: 0,
    pagoWei: 0n,
  })),
}));

function preencherEEntrar(identificador, senha) {
  fireEvent.change(screen.getByLabelText("Identificador"), {
    target: { value: identificador },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: senha },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("autenticacao e perfis", () => {
  test("sem sessao, qualquer tela leva ao login", async () => {
    await abrir("/seguradora/propostas");
    expect(await screen.findByRole("heading", { name: "AgroSmart" })).toBeTruthy();
    expect(screen.getByLabelText("Identificador")).toBeTruthy();
  });

  test("login com senha correta leva a tela do perfil", async () => {
    const { chamadas } = await abrir("/entrar", {
      rotas: {
        "POST /autenticacao/entrar": { token: "t", usuario: USUARIOS.produtor },
        "GET /apolices": { apolices: [] },
      },
    });

    preencherEEntrar("produtor", "agrosmart");

    await achar(/Meus talhões e seguros/);
    const login = chamadas.find((c) => c.caminho === "/autenticacao/entrar");
    expect(login.corpo).toEqual({
      identificador: "produtor",
      senha: "agrosmart",
    });
    expect(sessionStorage.getItem("agrosmart:token")).toBe("t");
  });

  test("quem sai de uma tela da seguradora e entra como produtor vai para a tela do produtor", async () => {
    // A ultima tela aberta fica guardada para voltar a ela depois do login; se
    // ela e de outro perfil, o certo e a tela inicial de quem entrou, e nao
    // "Sem acesso".
    await abrir(
      { pathname: "/entrar", state: { de: "/seguradora/propostas" } },
      {
        rotas: {
          "POST /autenticacao/entrar": {
            token: "t",
            usuario: USUARIOS.produtor,
          },
          "GET /apolices": { apolices: [] },
        },
      },
    );

    preencherEEntrar("produtor", "agrosmart");

    expect(await achar(/Meus talhões e seguros/)).toBeTruthy();
    expect(screen.queryByText("Sem acesso")).toBeNull();
  });

  test("tela comum guardada antes do login continua valendo", async () => {
    await abrir(
      { pathname: "/entrar", state: { de: "/notificacoes" } },
      {
        rotas: {
          "POST /autenticacao/entrar": {
            token: "t",
            usuario: USUARIOS.seguradora,
          },
        },
      },
    );

    preencherEEntrar("seguradora", "agrosmart");
    expect(await achar("Nenhuma notificacao.")).toBeTruthy();
  });

  test("senha errada mostra a mensagem do servidor", async () => {
    await abrir("/entrar", {
      rotas: {
        "POST /autenticacao/entrar": {
          status: 401,
          corpo: {
            erro: {
              codigo: "nao_autenticado",
              mensagem: "Identificador ou senha invalidos.",
            },
          },
        },
      },
    });

    preencherEEntrar("produtor", "errada");

    expect(await achar("Identificador ou senha invalidos.")).toBeTruthy();
  });

  test("perfil errado vai para 'sem acesso'", async () => {
    await abrir("/seguradora/propostas", {
      perfil: "produtor",
      rotas: { "GET /apolices": { apolices: [] } },
    });
    expect(await achar("Sem acesso")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Voltar ao inicio" }));
    await achar(/Meus talhões e seguros/);
  });

  test("endereco inexistente mostra a pagina de nao encontrada", async () => {
    await abrir("/nao-existe", { perfil: "produtor" });
    expect(await achar("Pagina nao encontrada")).toBeTruthy();
  });

  test("sessao expirada no servidor volta ao login", async () => {
    await abrir("/notificacoes", {
      perfil: "produtor",
      rotas: {
        "GET /notificacoes": {
          status: 401,
          corpo: { erro: { mensagem: "Sessao expirada." } },
        },
      },
    });

    expect(await screen.findByLabelText("Identificador", {}, { timeout: 3000 })).toBeTruthy();
    expect(sessionStorage.getItem("agrosmart:token")).toBeNull();
  });

  test("sair encerra a sessao no servidor e localmente", async () => {
    const { chamadas } = await abrir("/notificacoes", { perfil: "produtor" });

    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));

    await screen.findByLabelText("Identificador");
    expect(chamadas.some((c) => c.caminho === "/autenticacao/sair")).toBe(true);
  });
});

describe("a conta da MetaMask no cabecalho", () => {
  afterEach(() => {
    cleanup();
    delete window.ethereum;
    localStorage.clear();
  });

  test("seguradora com a conta do produtor selecionada ve 'conta errada'", async () => {
    carteiraFalsa(CONTA_DO_PRODUTOR);
    await abrir("/notificacoes", { perfil: "seguradora" });

    const selo = await achar(/conta errada/);
    expect(selo.getAttribute("title")).toMatch(/nao e a da seguradora/);
  });

  test("seguradora com a propria conta ve o selo verde", async () => {
    carteiraFalsa(CONTA_DA_SEGURADORA);
    await abrir("/notificacoes", { perfil: "seguradora" });

    await achar("Nenhuma notificacao.");
    await waitFor(() => expect(document.querySelector("header .selo.sucesso")).not.toBeNull());
    expect(screen.queryByText(/conta errada/)).toBeNull();
  });
});

test("login em andamento usa texto legivel e impede envio repetido", async () => {
  let resolver;
  await abrir("/entrar", {
    rotas: {
      "POST /autenticacao/entrar": () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    },
  });
  preencherEEntrar("produtor", "senha");
  const botao = await screen.findByRole("button", { name: "Entrando..." });
  expect(botao.disabled).toBe(true);
  resolver({ status: 401, corpo: { erro: { mensagem: "Senha incorreta." } } });
  expect(await achar("Senha incorreta.")).toBeTruthy();
});

test("falha ao conectar carteira aparece na tela", async () => {
  carteiraFalsa(CONTA_DO_PRODUTOR);
  localStorage.removeItem("agrosmart:carteira-conectada");
  window.ethereum.request = async () => {
    throw Object.assign(new Error("recusado"), { code: 4001 });
  };
  await abrir("/conta", { perfil: "produtor" });
  fireEvent.click(await screen.findByRole("button", { name: "Conectar carteira" }));
  expect(await achar("Voce cancelou a operacao na carteira.")).toBeTruthy();
});

test("erro ao marcar aviso como lido nao fica silencioso", async () => {
  await abrir("/notificacoes", {
    perfil: "produtor",
    rotas: {
      "GET /notificacoes": {
        naoLidas: 1,
        notificacoes: [
          {
            id: "n1",
            titulo: "Garantia depositada",
            mensagem: "Apolice ativa",
            criada_em: "2026-10-28T10:00:00Z",
          },
        ],
      },
      "POST /notificacoes/:id/lida": {
        status: 503,
        corpo: { erro: { mensagem: "API indisponivel ao marcar" } },
      },
    },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Marcar como lida" }));
  expect(await achar("API indisponivel ao marcar")).toBeTruthy();
});
