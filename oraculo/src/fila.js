"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Mensagem legivel de um erro de publicacao.
 *
 * Quando o contrato reverte com erro customizado, o ethers o decodifica em
 * `erro.revert`, mas a `shortMessage` continua dizendo "unknown custom error".
 * O nome do erro e o que diz ao operador o que aconteceu.
 */
function descreverErro(erro) {
  if (erro?.revert?.name) {
    const argumentos = (erro.revert.args ?? []).map((a) => String(a)).join(", ");
    return `${erro.revert.name}(${argumentos})`;
  }
  return erro?.shortMessage || erro?.message || String(erro);
}

/** Verdadeiro quando o contrato recusou a chamada com um erro proprio. */
function ehRecusaDoContrato(erro) {
  return Boolean(erro?.revert?.name);
}

/**
 * Fila persistente de publicacoes (RF21, RNF20).
 *
 * O problema que ela resolve: entre consolidar o indice e ve-lo confirmado na
 * cadeia existe uma janela em que tudo pode dar errado — a rede congestiona, o
 * no RPC cai, o processo do oraculo morre. Se o indice existir apenas na memoria
 * do processo, ele se perde, e o RNF20 diz que indisponibilidade do oraculo ou da
 * rede nao pode causar perda de dados.
 *
 * Por isso a consolidacao grava em disco ANTES de tentar publicar, e a entrada so
 * sai da fila depois da confirmacao. Reiniciar o servico retoma exatamente de onde
 * parou, preservando o periodo de referencia original.
 */

const ESTADOS = {
  PENDENTE: "pendente",
  PUBLICANDO: "publicando",
  CONCLUIDA: "concluida",
  FALHA: "falha",
};

class FilaDePublicacoes {
  /**
   * @param {string} arquivo Caminho do arquivo JSON de persistencia.
   * @param {object} [opcoes]
   * @param {number} [opcoes.maxTentativas=5]
   */
  constructor(arquivo, opcoes = {}) {
    this.arquivo = arquivo;
    this.maxTentativas = opcoes.maxTentativas ?? 5;
    if (!Number.isInteger(this.maxTentativas) || this.maxTentativas < 1 || this.maxTentativas > 10)
      throw new Error("MAX_TENTATIVAS deve ser inteiro entre 1 e 10.");
    this.entradas = [];

    this.carregar();
  }

  /** Chave logica de uma publicacao: uma apolice nunca repete o mesmo periodo. */
  static chave(apolice, periodo) {
    return `${String(apolice).toLowerCase()}:${periodo}`;
  }

  /**
   * Coloca uma publicacao na fila. Repetir a mesma apolice e periodo nao cria
   * uma segunda entrada: o contrato rejeitaria a duplicata de qualquer forma
   * (RF20), e gastar gas para descobrir isso seria desperdicio.
   *
   * @returns {{entrada: object, novo: boolean}}
   */
  enfileirar({ apolice, periodo, payload }) {
    const chave = FilaDePublicacoes.chave(apolice, periodo);
    const existente = this.entradas.find((e) => e.chave === chave);

    if (existente) return { entrada: existente, novo: false };

    const entrada = {
      chave,
      apolice,
      periodo,
      payload,
      estado: ESTADOS.PENDENTE,
      tentativas: 0,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      ultimoErro: null,
      recibo: null,
    };

    this.entradas.push(entrada);
    this.salvar();

    return { entrada, novo: true };
  }

  /**
   * Proxima entrada a tentar.
   *
   * Entradas em estado `publicando` voltam a ser candidatas: esse estado so
   * persiste em disco se o processo morreu no meio de uma tentativa, e nesse caso
   * retomar e justamente o comportamento desejado.
   */
  proxima() {
    return this.entradas.find(
      (e) =>
        (e.estado === ESTADOS.PENDENTE || e.estado === ESTADOS.PUBLICANDO) &&
        e.tentativas < this.maxTentativas,
    );
  }

  /** Todas as entradas que ainda precisam de atencao. */
  pendentes() {
    return this.entradas.filter(
      (e) => e.estado === ESTADOS.PENDENTE || e.estado === ESTADOS.PUBLICANDO,
    );
  }

  marcarPublicando(entrada) {
    entrada.estado = ESTADOS.PUBLICANDO;
    entrada.tentativas += 1;
    entrada.atualizadoEm = new Date().toISOString();
    this.salvar();

    return entrada;
  }

  marcarTransmitida(entrada, transacao) {
    entrada.transacao = transacao;
    entrada.atualizadoEm = new Date().toISOString();
    this.salvar();
  }

  marcarConcluida(entrada, recibo) {
    entrada.estado = ESTADOS.CONCLUIDA;
    entrada.recibo = recibo;
    entrada.ultimoErro = null;
    entrada.atualizadoEm = new Date().toISOString();
    this.salvar();

    return entrada;
  }

  /**
   * Registra a falha de uma tentativa.
   *
   * A entrada so vai para o estado final `falha` depois de esgotadas as
   * tentativas. Ate la ela continua pendente, que e o que permite a retomada.
   */
  marcarErro(entrada, erro) {
    entrada.ultimoErro = {
      mensagem: descreverErro(erro),
      codigo: erro?.code ?? null,
      recusaDoContrato: ehRecusaDoContrato(erro),
      em: new Date().toISOString(),
    };

    // Recusa explicita do contrato e definitiva: repetir a mesma chamada da a
    // mesma resposta. As novas tentativas do RF21 sao para a rede indisponivel.
    entrada.estado =
      ehRecusaDoContrato(erro) || erro?.definitivo || entrada.tentativas >= this.maxTentativas
        ? ESTADOS.FALHA
        : ESTADOS.PENDENTE;
    entrada.atualizadoEm = new Date().toISOString();
    this.salvar();

    return entrada;
  }

  /** Devolve uma entrada esgotada ao estado pendente, zerando as tentativas. */
  reabrir(chave) {
    const entrada = this.entradas.find((e) => e.chave === chave);
    if (!entrada) return null;

    entrada.estado = ESTADOS.PENDENTE;
    entrada.tentativas = 0;
    entrada.atualizadoEm = new Date().toISOString();
    this.salvar();

    return entrada;
  }

  resumo() {
    const contagem = { pendente: 0, publicando: 0, concluida: 0, falha: 0 };
    for (const e of this.entradas) contagem[e.estado] += 1;

    return { total: this.entradas.length, ...contagem };
  }

  carregar() {
    if (!fs.existsSync(this.arquivo)) return;

    try {
      const bruto = JSON.parse(fs.readFileSync(this.arquivo, "utf8"));
      if (
        !Array.isArray(bruto.entradas) ||
        bruto.entradas.some((e) => !e || !Object.values(ESTADOS).includes(e.estado) || !e.payload)
      )
        throw new Error("Estrutura da fila invalida.");
      this.entradas = bruto.entradas;
      for (const entrada of this.entradas) {
        if (entrada.estado === ESTADOS.PUBLICANDO && entrada.tentativas >= this.maxTentativas) {
          if (entrada.transacao) entrada.tentativas = this.maxTentativas - 1;
          else {
            entrada.estado = ESTADOS.FALHA;
            entrada.ultimoErro = {
              mensagem: "Interrupcao no limite de tentativas; confira a cadeia antes de reabrir.",
            };
          }
        }
      }
    } catch (erro) {
      // Um arquivo de fila corrompido nao pode derrubar o servico, mas tambem
      // nao pode ser descartado em silencio: o operador precisa saber.
      throw new Error(
        `Fila corrompida em ${this.arquivo}: ${erro.message}. ` +
          "Inspecione o arquivo antes de remove-lo; ele contem indices ainda nao publicados.",
      );
    }
  }

  salvar() {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    const temporario = `${this.arquivo}.tmp-${process.pid}`;
    fs.writeFileSync(
      temporario,
      `${JSON.stringify({ atualizadoEm: new Date().toISOString(), entradas: this.entradas }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`,
      { encoding: "utf8", flush: true },
    );
    fs.renameSync(temporario, this.arquivo);
  }
}

module.exports = {
  descreverErro,
  ehRecusaDoContrato,
  FilaDePublicacoes,
  ESTADOS,
};
