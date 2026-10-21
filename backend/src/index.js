import { readFileSync } from "node:fs";
import https from "node:https";
import { importarInmet } from "./banco/importarInmet.js";

import { criarApp } from "./app.js";
import { config } from "./config.js";
import { abrirBanco } from "./banco/conexao.js";
import { criarDespachanteDeEmail } from "./notificacoes/email.js";
import { inicializarBanco } from "./banco/inicializar.js";
import { semear } from "./banco/semente.js";
import { criarIndexador } from "./cadeia/indexador.js";
import { criarLeitorDaCadeia } from "./cadeia/leitor.js";
import { encerrarProvedor } from "./cadeia/rede.js";

/**
 * Ponto de entrada do backend.
 *
 * Na ordem: abre o banco, inicializa o esquema atual, semeia a demonstracao (so em
 * desenvolvimento e com banco vazio), liga o indexador e abre a porta.
 */
async function iniciar() {
  const banco = await abrirBanco();
  const criadas = await inicializarBanco(banco);

  if (criadas.length > 0) console.log(`Estrutura criada: ${criadas.join(", ")}`);

  const importacao = await importarInmet(banco);
  if (importacao.anos)
    console.log(
      `INMET importado: ${importacao.anos} anos, ${importacao.dias} dias. Datas originais preservadas.`,
    );

  if (!config.emProducao && (await semear(banco))) {
    console.log(
      "Dados de demonstracao criados. Usuarios: produtor, seguradora (senha: agrosmart).",
    );
  }

  const cadeia = criarLeitorDaCadeia();
  const indexador = config.indexadorAtivo ? criarIndexador(banco) : null;
  const despachante = config.emailAtivo ? criarDespachanteDeEmail(banco) : null;

  const app = criarApp({ banco, cadeia, indexador });

  const comTls = Boolean(config.tlsCertificado && config.tlsChave);
  const aoOuvir = () => {
    console.log(
      `AgroSmart backend em ${comTls ? "https" : "http"}://localhost:${config.porta}/api`,
    );
    console.log(`Banco: ${banco.motor}`);
    console.log(
      cadeia.disponivel()
        ? `Cadeia: ${config.rede}, fabrica ${cadeia.enderecoDaFabrica()}`
        : `Cadeia: nenhuma implantacao encontrada para "${config.rede}"; indexador em espera.`,
    );
  };

  // RNF17: com certificado e chave, a API atende so em https.
  const servidor = comTls
    ? https
        .createServer(
          {
            cert: readFileSync(config.tlsCertificado),
            key: readFileSync(config.tlsChave),
          },
          app,
        )
        .listen(config.porta, aoOuvir)
    : app.listen(config.porta, aoOuvir);

  indexador?.iniciar();
  despachante?.iniciar();
  if (despachante) {
    console.log(
      config.smtpUrl
        ? "E-mail: enviando pelo SMTP configurado."
        : `E-mail: sem SMTP_URL, mensagens gravadas em ${config.dirEmails}`,
    );
  }

  // Encerramento limpo: para o indexador, fecha a porta e o banco. Sem isso, o
  // processo pode manter conexoes abertas apos o pedido de encerramento.
  const encerrar = async (sinal) => {
    console.log(`\n${sinal} recebido, encerrando...`);
    indexador?.parar();
    despachante?.parar();
    servidor.close();
    encerrarProvedor();
    await banco.fechar();
    process.exit(0);
  };

  process.on("SIGINT", () => encerrar("SIGINT"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));
}

iniciar().catch((erro) => {
  console.error("Falha ao iniciar o backend:", erro);
  process.exit(1);
});
