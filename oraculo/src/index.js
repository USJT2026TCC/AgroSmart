#!/usr/bin/env node
"use strict";

const path = require("node:path");

const { ethers } = require("ethers");

const { config, lerImplantacao } = require("./config");
const { ServicoOraculo } = require("./oraculo");
const { executarCiclo } = require("./ciclo");
const { FilaDePublicacoes } = require("./fila");
const { RegistroDePublicacoes } = require("./registro");

/**
 * Interface de linha de comando do servico de oraculo.
 *
 * Comandos:
 *   status                        situacao do oraculo: endereco, saldo, autorizacao
 *   servico                       publica continuamente as apolices ativas do backend
 *   ouvir    --apolice 0x...      acompanha os eventos da apolice em tempo real
 *   fila                          mostra a fila de publicacoes pendentes
 *   estatisticas                  gas e latencia das publicacoes ja realizadas
 */

// ---------------------------------------------------------------- utilitarios

function lerArgumentos(argv) {
  const opcoes = {};
  let chaveAtual = null;

  for (const pedaco of argv) {
    if (pedaco.startsWith("--")) {
      chaveAtual = pedaco.slice(2);
      opcoes[chaveAtual] = true;
    } else if (chaveAtual) {
      opcoes[chaveAtual] = pedaco;
      chaveAtual = null;
    }
  }

  return opcoes;
}

const titulo = (texto) => {
  console.log("");
  console.log(texto);
  console.log("-".repeat(texto.length));
};

function exigirApolice(opcoes) {
  const endereco = opcoes.apolice || process.env.ENDERECO_APOLICE;

  if (!endereco || !ethers.isAddress(endereco)) {
    throw new Error(
      "Informe o endereco da apolice: --apolice 0x... (ou defina ENDERECO_APOLICE no .env)",
    );
  }

  return ethers.getAddress(endereco);
}

/**
 * Cria o servico e guarda a referencia para que `main` possa encerrar a conexao
 * com o no ao final. Sem isso o processo termina de imprimir o resultado e nao
 * devolve o terminal, porque o temporizador de sondagem do provedor continua vivo.
 */
let servicoAtivo = null;

function criarServico(opcoes) {
  servicoAtivo = ServicoOraculo.criar(opcoes);

  return servicoAtivo;
}

// ---------------------------------------------------------------- comandos

async function comandoStatus() {
  const servico = criarServico();
  const implantacao = lerImplantacao();

  titulo("Servico de oraculo");
  console.log(`Rede...............: ${config.rede}`);
  console.log(`Protocolo no manifesto: ${implantacao.versaoProtocolo ?? "nao informado"}`);
  if (implantacao.versaoProtocolo !== "clima-historico-v3")
    console.log("Atencao: o manifesto ainda nao indica a fabrica historica atualizada.");
  console.log(`Endereco do oraculo: ${servico.publicador.endereco}`);
  console.log(`Saldo..............: ${ethers.formatEther(await servico.publicador.saldo())} ETH`);

  const registry = implantacao.contratos.OracleRegistry;
  const autorizado = await servico.publicador.estaAutorizado(registry);

  console.log(`OracleRegistry.....: ${registry}`);
  console.log(`Autorizado a publicar: ${autorizado ? "sim" : "NAO"}`);

  if (!autorizado) {
    console.log("");
    console.log("O endereco nao esta autorizado. A seguradora precisa chamar");
    console.log(`  OracleRegistry.autorizar(${servico.publicador.endereco})`);
  }

  titulo("Fila de publicacoes");
  console.log(JSON.stringify(servico.fila.resumo(), null, 2));
}

/** Servico historico continuo. As datas vem da cobertura, nunca do dia atual. */
async function comandoServico(opcoes) {
  const intervalo = Number(opcoes.intervalo ?? config.intervaloDoServicoMs);
  if (!Number.isInteger(intervalo) || intervalo < 100 || intervalo > 3600000)
    throw new Error("Intervalo deve ser inteiro entre 100 e 3600000 ms.");
  if (opcoes.periodo)
    throw new Error("O periodo vem da cobertura historica; --periodo foi retirado.");
  const servico = criarServico({ somenteHistorico: true });
  if (!servico.backend) throw new Error("O modo servico exige API_URL e CHAVE_DE_SERVICO.");
  console.log("Oraculo historico: A770; indice desde o inicio da cobertura.");
  let parar = false;
  const interromper = () => {
    parar = true;
  };
  process.once("SIGINT", interromper);
  process.once("SIGTERM", interromper);
  try {
    do {
      await executarCiclo(servico);
      if (opcoes["uma-vez"] || parar) break;
      await new Promise((r) => setTimeout(r, intervalo));
    } while (!parar);
  } finally {
    process.removeListener("SIGINT", interromper);
    process.removeListener("SIGTERM", interromper);
  }
}

async function comandoOuvir(opcoes) {
  const apolice = exigirApolice(opcoes);
  const servico = criarServico();

  titulo(`Escutando os eventos de ${apolice}`);
  console.log("Pressione Ctrl+C para encerrar.");
  console.log("");

  const encerrar = await servico.publicador.ouvir(apolice, (evento) => {
    const quando = new Date().toISOString();
    console.log(`[${quando}] ${evento.evento}`);

    for (const [nome, valor] of Object.entries(evento.argumentos)) {
      console.log(`    ${nome}: ${valor}`);
    }

    if (evento.txHash) console.log(`    tx: ${evento.txHash}`);
  });

  process.on("SIGINT", () => {
    encerrar();
    process.exit(0);
  });

  // Mantem o processo vivo enquanto ha escuta ativa.
  await new Promise(() => {});
}

function comandoFila(opcoes) {
  const fila = new FilaDePublicacoes(path.join(config.dirDados, "fila.json"), {
    maxTentativas: config.maxTentativas,
  });

  if (opcoes.reabrir && opcoes.reabrir !== true) {
    const entrada = fila.reabrir(opcoes.reabrir);

    console.log(
      entrada
        ? `Entrada ${entrada.chave} reaberta; tentativas zeradas.`
        : `Entrada ${opcoes.reabrir} nao encontrada.`,
    );

    return;
  }

  titulo("Fila de publicacoes");
  console.log(JSON.stringify(fila.resumo(), null, 2));

  const pendentes = fila.pendentes();
  if (pendentes.length === 0) {
    console.log("");
    console.log("Nenhuma publicacao pendente.");
    return;
  }

  titulo("Pendentes");
  for (const e of pendentes) {
    console.log(
      `${e.chave} | tentativas ${e.tentativas}/${fila.maxTentativas} | ` +
        `indice ${e.payload.indiceClimatico} | ${e.ultimoErro?.mensagem ?? "sem erro registrado"}`,
    );
  }
}

function comandoEstatisticas() {
  const registro = new RegistroDePublicacoes(path.join(config.dirDados, "publicacoes.jsonl"));
  const estatisticas = registro.estatisticas();

  titulo("Publicacoes registradas");

  if (!estatisticas) {
    console.log("Nenhuma publicacao registrada ainda.");
    return;
  }

  console.log(JSON.stringify(estatisticas, null, 2));
}

// ---------------------------------------------------------------- despacho

const COMANDOS = {
  status: comandoStatus,
  servico: comandoServico,
  ouvir: comandoOuvir,
  fila: comandoFila,
  estatisticas: comandoEstatisticas,
};

async function main() {
  const [, , comando, ...resto] = process.argv;

  if (!comando || !COMANDOS[comando]) {
    console.log("Servico de oraculo do AgroSmart");
    console.log("");
    console.log("Uso: node src/index.js <comando> [opcoes]");
    console.log("");
    console.log("  status                            endereco, saldo e autorizacao do oraculo");
    console.log(
      "  servico  [--uma-vez]              publica continuamente as apolices ativas do backend",
    );
    console.log("  ouvir    --apolice 0x...          acompanha os eventos da apolice");
    console.log("  fila     [--reabrir <chave>]      mostra ou reabre a fila de publicacoes");
    console.log("  estatisticas                      gas e latencia das publicacoes");
    console.log("");
    console.log("  --intervalo  espera entre ciclos em ms (datas vem da cobertura)");

    process.exitCode = comando ? 1 : 0;
    return;
  }

  try {
    const opcoes = lerArgumentos(resto);
    const permitidas = {
      status: [],
      servico: ["intervalo", "uma-vez"],
      ouvir: ["apolice"],
      fila: ["reabrir"],
      estatisticas: [],
    };
    for (const nome of Object.keys(opcoes))
      if (!permitidas[comando].includes(nome))
        throw new Error(`Opcao --${nome} nao pertence ao comando ${comando}.`);
    await COMANDOS[comando](opcoes);
  } finally {
    // `ouvir` fica de proposito com a conexao aberta: ele so termina no Ctrl+C.
    if (comando !== "ouvir") servicoAtivo?.encerrar();
  }
}

main().catch((erro) => {
  console.error("");
  console.error(`Falha: ${erro.shortMessage || erro.message}`);
  process.exitCode = 1;
});
