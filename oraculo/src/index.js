#!/usr/bin/env node
"use strict";

const path = require("node:path");

const { ethers } = require("ethers");

const { config, lerImplantacao } = require("./config");
const limites = require("../../configuracao/historico.json");
const { ServicoOraculo } = require("./oraculo");
const { executarCiclo } = require("./ciclo");
const { FilaDePublicacoes } = require("./fila");

/**
 * Interface de linha de comando do servico de oraculo.
 *
 * Comandos:
 *   status     situacao do oraculo: endereco, saldo, autorizacao
 *   servico    publica continuamente as apolices ativas do backend
 *   fila       mostra a fila de publicacoes pendentes
 */

// ---------------------------------------------------------------- utilitarios

function lerArgumentos(argv) {
  const opcoes = {};
  let chaveAtual = null;

  for (const pedaco of argv) {
    if (pedaco.startsWith("--")) {
      chaveAtual = pedaco.slice(2);
      if (Object.hasOwn(opcoes, chaveAtual)) throw new Error(`Opcao --${chaveAtual} repetida.`);
      opcoes[chaveAtual] = true;
    } else if (chaveAtual) {
      opcoes[chaveAtual] = pedaco;
      chaveAtual = null;
    } else {
      throw new Error(`Opcao ou argumento inesperado: ${pedaco}.`);
    }
  }

  return opcoes;
}

const titulo = (texto) => {
  console.log("");
  console.log(texto);
  console.log("-".repeat(texto.length));
};

/**
 * Cria o servico e guarda a referencia para que `main` possa encerrar a conexao
 * com o no ao final. Sem isso o processo termina de imprimir o resultado e nao
 * devolve o terminal, porque o temporizador de sondagem do provedor continua vivo.
 */
let servicoAtivo = null;

function criarServico() {
  servicoAtivo = ServicoOraculo.criar();

  return servicoAtivo;
}

// ---------------------------------------------------------------- comandos

async function comandoStatus() {
  const servico = criarServico();
  const implantacao = lerImplantacao();

  titulo("Servico de oraculo");
  console.log(`Rede...............: ${config.rede}`);
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
  const servico = criarServico();
  if (!servico.backend) throw new Error("O modo servico exige API_URL e CHAVE_DE_SERVICO.");
  console.log(`Oraculo historico: ${limites.estacao}; indice desde o inicio da cobertura.`);
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

function comandoFila() {
  const fila = new FilaDePublicacoes(path.join(config.dirDados, "fila.json"), {
    maxTentativas: config.maxTentativas,
  });

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

// ---------------------------------------------------------------- despacho

const COMANDOS = {
  status: comandoStatus,
  servico: comandoServico,
  fila: comandoFila,
};

async function main() {
  const [, , comando, ...resto] = process.argv;

  if (!comando || !COMANDOS[comando]) {
    console.log("Servico de oraculo do AgroSmart");
    console.log("");
    console.log("Uso: node src/index.js <comando> [opcoes]");
    console.log("");
    console.log("  status                 endereco, saldo e autorizacao do oraculo");
    console.log("  servico  [--uma-vez]   publica continuamente as apolices ativas do backend");
    console.log("  fila                   mostra a fila de publicacoes");
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
      fila: [],
    };
    for (const nome of Object.keys(opcoes))
      if (!permitidas[comando].includes(nome))
        throw new Error(`Opcao --${nome} nao pertence ao comando ${comando}.`);
    if (opcoes["uma-vez"] !== undefined && opcoes["uma-vez"] !== true)
      throw new Error("Opcao --uma-vez não aceita valor.");
    await COMANDOS[comando](opcoes);
  } finally {
    servicoAtivo?.encerrar();
  }
}

main().catch((erro) => {
  console.error("");
  console.error(`Falha: ${erro.shortMessage || erro.message}`);
  process.exitCode = 1;
});
