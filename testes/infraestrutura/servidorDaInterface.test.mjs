import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";
let api, interfaceWeb, endereco, porta;
before(async () => {
  api = http
    .createServer((pedido, resposta) => {
      if (pedido.url === "/api/falhar") {
        pedido.socket.destroy();
        return;
      }
      if (pedido.url === "/api/interromper") {
        resposta.writeHead(200, { "Content-Type": "application/json" });
        resposta.write('{"parcial":');
        setTimeout(() => resposta.destroy(), 20);
        return;
      }
      let corpo = "";
      pedido.on("data", (parte) => (corpo += parte));
      pedido.on("end", () => {
        resposta.writeHead(201, {
          "Content-Type": "application/json",
          "Set-Cookie": "sessao=fixture; HttpOnly",
        });
        resposta.end(
          JSON.stringify({
            caminho: pedido.url,
            metodo: pedido.method,
            corpo,
            chave: pedido.headers["x-chave-servico"],
          }),
        );
      });
    })
    .listen(0, "127.0.0.1");
  await once(api, "listening");
  process.env.API_ALVO = `http://127.0.0.1:${api.address().port}`;
  const { criarServidor } = await import("../../scripts/servir-interface.mjs");
  interfaceWeb = criarServidor().listen(0, "127.0.0.1");
  await once(interfaceWeb, "listening");
  porta = interfaceWeb.address().port;
  endereco = `http://127.0.0.1:${porta}`;
});
after(async () => {
  await Promise.all(
    [api, interfaceWeb].filter(Boolean).map(
      (s) =>
        new Promise((resolve) => {
          s.close(resolve);
          s.closeAllConnections();
        }),
    ),
  );
  delete process.env.API_ALVO;
});
test("interface compilada atende a raiz e rotas da aplicação", async () => {
  for (const caminho of ["/", "/apolices/fixture"]) {
    const resposta = await fetch(endereco + caminho);
    assert.equal(resposta.status, 200);
    assert.match(resposta.headers.get("content-type"), /text\/html/);
    assert.match(await resposta.text(), /id="raiz"/);
  }
});
test("recursos inexistentes não recebem HTML da aplicação", async () => {
  assert.equal((await fetch(endereco + "/assets/inexistente.js")).status, 404);
});
test("proxy conserva método, consulta, corpo e cookie da API", async () => {
  const resposta = await fetch(endereco + "/api/fixture?modo=historico", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Chave-Servico": "fixture",
    },
    body: '{"gatilho":15}',
  });
  assert.equal(resposta.status, 201);
  assert.match(resposta.headers.get("set-cookie"), /sessao=fixture/);
  assert.deepEqual(await resposta.json(), {
    caminho: "/api/fixture?modo=historico",
    metodo: "POST",
    corpo: '{"gatilho":15}',
    chave: "fixture",
  });
});
test("URL absoluta não troca o destino fixo do proxy", async () => {
  const corpo = await new Promise((resolve, reject) => {
    http
      .get(
        {
          host: "127.0.0.1",
          port: porta,
          path: "http://destino-invalido.invalid/api/fixture",
        },
        (resposta) => {
          let texto = "";
          resposta.on("data", (parte) => (texto += parte));
          resposta.on("end", () => resolve(texto));
        },
      )
      .on("error", reject);
  });
  assert.equal(JSON.parse(corpo).caminho, "/api/fixture");
});

test("falha de conexao da API devolve JSON 502 compreensivel pela interface", async () => {
  const resposta = await fetch(endereco + "/api/falhar");
  assert.equal(resposta.status, 502);
  assert.equal((await resposta.json()).erro.codigo, "api_indisponivel");
});
test("API interrompida nao derruba o servidor nem completa resposta truncada", async () => {
  await assert.rejects(async () => {
    const r = await fetch(endereco + "/api/interromper");
    await r.text();
  });
  assert.equal((await fetch(endereco)).status, 200);
});
test("servidor atende HEAD sem corpo e recusa escrita em arquivos estaticos", async () => {
  const r = await fetch(endereco, { method: "HEAD" });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
  assert.equal((await fetch(endereco + "/entrar", { method: "POST" })).status, 405);
});
