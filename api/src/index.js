import { importarInmet } from "./banco/importarInmet.js";

import { criarApp } from "./app.js";
import { config } from "./config.js";
import { abrirBanco } from "./banco/conexao.js";
import { inicializarBanco } from "./banco/inicializar.js";
import { semear } from "./banco/semente.js";
import { criarIndexador } from "./cadeia/indexador.js";
import { criarLeitorDaCadeia } from "./cadeia/leitor.js";
import { encerrarProvedor } from "./cadeia/rede.js";

/**
 * Ponto de entrada do backend.
 *
 * Na ordem: abre o banco, inicializa o esquema atual, importa o INMET, semeia a
 * demonstracao (so com banco vazio), liga o indexador e abre a porta.
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

  if (await semear(banco)) {
    console.log(
      "Dados de demonstracao criados. Usuarios: produtor, seguradora (senha: agrosmart).",
    );
  }

  const cadeia = criarLeitorDaCadeia();
  const indexador = criarIndexador(banco);

  const app = criarApp({ banco, cadeia, indexador });

  const aoOuvir = () => {
    console.log(`AgroSmart backend em http://localhost:${config.porta}/api`);
    console.log(`Banco: ${banco.motor}`);
    console.log(
      cadeia.disponivel()
        ? `Cadeia: ${config.rede}, fabrica ${cadeia.enderecoDaFabrica()}`
        : `Cadeia: nenhuma implantacao encontrada para "${config.rede}"; indexador em espera.`,
    );
  };

  const servidor = app.listen(config.porta, aoOuvir);

  indexador?.iniciar();

  // Encerramento limpo: para o indexador, fecha a porta e o banco. Sem isso, o
  // processo pode manter conexoes abertas apos o pedido de encerramento.
  const encerrar = async (sinal) => {
    console.log(`\n${sinal} recebido, encerrando...`);
    indexador?.parar();
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
