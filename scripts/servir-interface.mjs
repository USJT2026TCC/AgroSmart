import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("../interface/dist/", import.meta.url));
const alvo = new URL(process.env.API_ALVO || "http://api:3001");
if (alvo.protocol !== "http:") throw new Error("API interna deve usar HTTP na rede Docker.");
const tipos = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
export function criarServidor() {
  return http.createServer(async (pedido, resposta) => {
    let url;
    try {
      url = new URL(pedido.url, "http://interface");
    } catch {
      resposta.writeHead(400);
      resposta.end();
      return;
    }
    const caminho = url.pathname;
    if (caminho === "/api" || caminho.startsWith("/api/")) {
      const proxy = http.request(
        new URL(caminho + url.search, alvo),
        {
          method: pedido.method,
          headers: { ...pedido.headers, host: alvo.host },
          timeout: 15000,
        },
        (recebido) => {
          resposta.writeHead(recebido.statusCode, recebido.headers);
          recebido.pipe(resposta);
        },
      );
      proxy.on("timeout", () => proxy.destroy());
      proxy.on("error", () => {
        if (!resposta.headersSent) resposta.writeHead(502);
        resposta.end("API indisponivel");
      });
      pedido.on("aborted", () => proxy.destroy());
      pedido.pipe(proxy);
      return;
    }
    if (!["GET", "HEAD"].includes(pedido.method)) {
      resposta.writeHead(405);
      resposta.end();
      return;
    }
    try {
      let arquivo = path.resolve(raiz, "." + decodeURIComponent(caminho));
      if (arquivo !== path.resolve(raiz) && !arquivo.startsWith(path.resolve(raiz) + path.sep)) {
        resposta.writeHead(403);
        resposta.end();
        return;
      }
      let info = await stat(arquivo).catch(() => null);
      if (!info?.isFile()) {
        if (caminho.startsWith("/assets/") || path.extname(caminho)) {
          resposta.writeHead(404);
          resposta.end();
          return;
        }
        arquivo = path.join(raiz, "index.html");
        info = await stat(arquivo);
      }
      resposta.writeHead(200, {
        "Content-Type": tipos[path.extname(arquivo)] || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": path.extname(arquivo) === ".html" ? "no-cache" : "public, max-age=3600",
      });
      if (pedido.method === "HEAD") resposta.end();
      else
        createReadStream(arquivo)
          .on("error", () => resposta.destroy())
          .pipe(resposta);
    } catch {
      resposta.writeHead(400);
      resposta.end("Requisicao invalida");
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const servidor = criarServidor().listen(Number(process.env.PORTA || 5173), "0.0.0.0");
  for (const sinal of ["SIGTERM", "SIGINT"])
    process.on(sinal, () => servidor.close(() => process.exit(0)));
}
