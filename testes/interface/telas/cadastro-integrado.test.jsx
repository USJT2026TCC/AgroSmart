import { createRequire } from "node:module";
import { resolve } from "node:path";
import { URL as NodeURL, pathToFileURL } from "node:url";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "../../../interface/src/App.jsx";
import { ProvedorSessao } from "../../../interface/src/sessao/SessaoContexto.jsx";
import { ProvedorCarteira } from "../../../interface/src/cadeia/CarteiraContexto.jsx";

test("seguradora cadastra dois talhoes para o produtor fixo usando API e PostgreSQL reais", async () => {
  process.env.NODE_ENV = "teste";
  process.env.LIMITE_LOGIN = "1000";
  process.env.INDEXADOR = "desligado";
  const URLAnterior = globalThis.URL;
  globalThis.URL = NodeURL;
  const carregar = createRequire(resolve(import.meta.dirname, "../../../api/package.json"));
  const importarNativo = carregar("../testes/interface/fixtures/importar-node.cjs");
  const { montar, entrar } = await importarNativo(
    pathToFileURL(carregar.resolve("../testes/api/fixtures/ajuda.js")).href,
  );
  const ctx = await montar();
  const fetchAnterior = globalThis.fetch;
  try {
    // Dados ficticios de cadastro, apenas neste banco descartavel.
    await ctx.banco
      .query(`INSERT INTO propostas(produtor_id,talhao_id,produto_id,carteira_produtor,valor_indenizacao_wei,termos)
      SELECT u.id,t.id,pr.id,u.carteira,pr.valor_indenizacao_wei,'{}'::jsonb
      FROM usuarios u JOIN propriedades pp ON pp.produtor_id=u.id JOIN talhoes t ON t.propriedade_id=pp.id
      CROSS JOIN produtos pr WHERE u.identificador='produtor' AND t.identificador='talhao-01' AND pr.cultura='soja' LIMIT 1`);
    const token = await entrar(ctx.api, "seguradora");
    sessionStorage.setItem("agrosmart:token", token);
    globalThis.fetch = vi.fn(async (url, opcoes = {}) => {
      let req = ctx.api()[String(opcoes.method || "GET").toLowerCase()](String(url));
      for (const [nome, valor] of Object.entries(opcoes.headers || {})) req = req.set(nome, valor);
      if (opcoes.body !== undefined) req = req.send(JSON.parse(opcoes.body));
      const resposta = await req;
      return {
        ok: resposta.status >= 200 && resposta.status < 300,
        status: resposta.status,
        json: async () => resposta.body,
      };
    });
    render(
      <MemoryRouter initialEntries={["/seguradora/talhoes"]}>
        <ProvedorSessao>
          <ProvedorCarteira>
            <App />
          </ProvedorCarteira>
        </ProvedorSessao>
      </MemoryRouter>,
    );
    for (const identificador of ["talhao-extra-01", "talhao-extra-02"]) {
      // Tela unica: produto e produtor fixos, a propriedade existente vem escolhida.
      await screen.findByRole("heading", { name: "Novo talhão" });
      expect(screen.queryByRole("button", { name: "Novo produtor" })).toBeNull();
      const propriedade = screen.getByLabelText("Propriedade");
      expect(propriedade.value).not.toBe("nova");
      fireEvent.change(screen.getByLabelText("Identificação do talhão"), {
        target: { value: identificador },
      });
      fireEvent.change(screen.getByLabelText("Área (ha)"), { target: { value: "12.5" } });
      fireEvent.click(screen.getByRole("button", { name: "Cadastrar talhão" }));
      await screen.findByText(new RegExp(`Talhão ${identificador} cadastrado`));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cadastrar talhão" }).disabled).toBe(false),
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    fireEvent.change(await screen.findByLabelText("Identificador"), {
      target: { value: "produtor" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "agrosmart" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(
      await screen.findByRole("link", { name: /Produtor · Jo/ }, { timeout: 5000 }),
    ).toBeTruthy();
    for (const nome of ["talhao-extra-01", "talhao-extra-02"]) {
      expect(
        await screen.findByRole("link", { name: `Solicitar proposta para ${nome}` }),
      ).toBeTruthy();
    }
    const usuarios = await ctx.banco.query("SELECT count(*)::int AS n FROM usuarios");
    expect(usuarios.rows[0].n).toBe(2);
  } finally {
    cleanup();
    globalThis.fetch = fetchAnterior;
    globalThis.URL = URLAnterior;
    sessionStorage.clear();
    await ctx.fechar();
  }
}, 30000);
