import express from "express";
import { rotasDoHistorico } from "./rotas/historico.js";

import { config } from "./config.js";
import { naoEncontrado, tratarErros } from "./erros.js";
import { rotasDeAutenticacao } from "./rotas/autenticacao.js";
import { rotasDeCarteira } from "./rotas/carteira.js";
import { rotasDeCadastro } from "./rotas/cadastro.js";
import { rotasDePropostas } from "./rotas/propostas.js";
import { rotasDeApolices } from "./rotas/apolices.js";
import { rotasDoOraculo } from "./rotas/oraculo.js";
import { rotasDeAcompanhamento } from "./rotas/acompanhamento.js";

/**
 * Monta a aplicacao Express.
 *
 * Recebe a conexão PostgreSQL, o leitor da blockchain e o indexador.
 * O ponto de entrada cria esses serviços antes de montar as rotas.
 *
 * @param {object} deps
 * @param {import("./banco/conexao.js").Banco} deps.banco
 * @param {ReturnType<import("./cadeia/leitor.js").criarLeitorDaCadeia>} deps.cadeia
 * @param {object} [deps.indexador]
 */
export function criarApp({ banco, cadeia, indexador = null }) {
  const app = express();

  app.locals.banco = banco;
  app.locals.cadeia = cadeia;
  app.locals.indexador = indexador;

  // Atras de um proxy reverso, o IP real vem no cabecalho X-Forwarded-For. Sem
  // isso, o limitador de requisicoes veria todo mundo com o IP do proxy.
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");

  app.use(express.json({ limit: "2mb" }));

  // CORS restrito a origem do aplicativo (http://localhost:5173).
  app.use((req, res, proximo) => {
    const origem = req.get("origin");

    if (origem && origem === config.origemDoAplicativo) {
      res.set("Access-Control-Allow-Origin", origem);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    proximo();
  });

  // Cabecalhos de seguranca basicos. Uma API JSON nao serve HTML, entao a
  // politica de conteudo pode ser a mais restritiva possivel.
  app.use((_req, res, proximo) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.set("Referrer-Policy", "no-referrer");
    proximo();
  });

  const api = express.Router();

  api.use(rotasDeAutenticacao());
  api.use(rotasDeCarteira());
  api.use(rotasDeCadastro());
  api.use(rotasDePropostas());
  api.use(rotasDoHistorico());
  api.use(rotasDeApolices());
  api.use(rotasDoOraculo());
  api.use(rotasDeAcompanhamento());

  app.use("/api", api);

  app.use((req, _res) => {
    throw naoEncontrado(`Rota ${req.method} ${req.path}`);
  });

  app.use(tratarErros);

  return app;
}
