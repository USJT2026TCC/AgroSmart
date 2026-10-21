"use strict";

const path = require("node:path");

const { config, exigirChave, lerImplantacao } = require("./config");
const { FilaDePublicacoes, ESTADOS, descreverErro } = require("./fila");
const { RegistroDePublicacoes } = require("./registro");
const { Publicador } = require("./publicador");
const { ClienteBackend } = require("./clienteBackend");

/**
 * Servico de oraculo do AgroSmart.
 *
 * Amarra as quatro pecas que fazem a travessia acontecer:
 *   serie historica verificada -> fila -> publicador -> registro
 *
 * A ordem importa. A consolidacao grava na fila antes de qualquer tentativa de
 * publicacao, de modo que uma queda da rede ou do proprio processo nao perca o
 * indice (RF21, RNF20). Só depois da confirmacao em cadeia a entrada sai da fila e
 * o custo e a latencia vao para o registro de auditoria (RF22).
 */
class ServicoOraculo {
  constructor({ publicador, fila, registro, backend = null, opcoes = {} }) {
    this.publicador = publicador;

    // O servico operacional consulta dados no backend e relata suas publicacoes.
    this.backend = backend;
    this.fila = fila;
    this.registro = registro;

    this.esperaBaseMs = opcoes.esperaBaseMs ?? config.esperaBaseMs;
    this.maxTentativas = opcoes.maxTentativas ?? config.maxTentativas;
    if (!Number.isInteger(this.esperaBaseMs) || this.esperaBaseMs < 0 || this.esperaBaseMs > 60000)
      throw new Error("ESPERA_BASE_MS deve ser inteiro entre 0 e 60000.");
    this.dirPacote = opcoes.dirPacote;
    this.somenteHistorico = true;
  }

  async prepararHistorico(apolice) {
    const { avaliarHistorico } = require("./historico");
    if (!this.backend) throw new Error("O modo historico exige backend autenticado.");
    const resposta = await this.backend.serieHistorica(apolice);
    const { termos, linhas } = resposta;
    const cadeia = await this.publicador.termosHistoricos(apolice);
    require("./vinculoHistorico").conferirVinculo(resposta, cadeia);
    require("./serieHistorica").conferirSerie(linhas, termos, this.dirPacote);
    const resultado = avaliarHistorico({
      linhas,
      inicio: termos.inicioHistorico,
      fim: termos.fimHistorico,
      gatilho: Number(termos.limiarClimatico),
    });
    if (resultado.diasIncompletos)
      throw new Error("Cobertura historica contem dias incompletos; publicacao bloqueada.");
    const data = resultado.primeiroAcionamento ?? resultado.fim;
    const periodo = Number(data.replaceAll("-", ""));
    const dia = resultado.dias.find((d) => d.data === data);
    const payload = {
      indiceClimatico: dia.indiceClimatico,
      procedencia: {
        modo: "reproducao-historica",
        estacao: "A770",
        hashSerie: termos.hashSerie,
        inicio: resultado.inicio,
        fim: resultado.fim,
        diasValidos: resultado.diasValidos,
        diasIncompletos: resultado.diasIncompletos,
        contagem: "inicio-da-cobertura",
        parametroExperimental: true,
      },
    };
    if (
      this.publicador.periodoJaPublicado &&
      (await this.publicador.periodoJaPublicado(apolice, periodo))
    )
      return { apolice, periodo, estado: "ja-publicada" };
    return this.fila.enfileirar({ apolice, periodo, payload }).entrada;
  }

  /** Monta o servico a partir da configuracao de ambiente. */
  static criar(opcoes = {}) {
    const dirDados = opcoes.dirDados ?? config.dirDados;

    // O chainId vem do arquivo de implantacao. Informa-lo dispensa a deteccao
    // automatica de rede do ethers, que com o no fora do ar fica repetindo a
    // consulta antes de desistir.
    let chainId = opcoes.chainId ?? null;
    if (chainId === null) {
      try {
        chainId = lerImplantacao().chainId ?? null;
      } catch {
        chainId = null;
      }
    }

    return new ServicoOraculo({
      publicador: new Publicador({
        rpcUrl: opcoes.rpcUrl ?? config.rpcUrl,
        chavePrivada: opcoes.chavePrivada ?? exigirChave(),
        confirmacoes: opcoes.confirmacoes ?? config.confirmacoes,
        timeoutMs: opcoes.timeoutMs ?? config.timeoutMs,
        chainId,
      }),
      fila: new FilaDePublicacoes(path.join(dirDados, "fila.json"), {
        maxTentativas: opcoes.maxTentativas ?? config.maxTentativas,
      }),
      registro: new RegistroDePublicacoes(path.join(dirDados, "publicacoes.jsonl")),
      backend:
        opcoes.backend ??
        (config.apiUrl && config.chaveDeServico
          ? new ClienteBackend({
              url: config.apiUrl,
              chave: config.chaveDeServico,
              timeoutMs: config.timeoutMs,
            })
          : null),
      opcoes,
    });
  }

  /**
   * Publica uma entrada da fila e registra o resultado.
   *
   * @returns {Promise<{sucesso: boolean, recibo?: object, erro?: Error}>}
   */
  async publicarEntrada(entrada) {
    this.fila.marcarPublicando(entrada);
    let recibo;
    try {
      if (this.somenteHistorico && entrada.payload.procedencia?.modo !== "reproducao-historica") {
        const erro = new Error("Entrada de sensores legada bloqueada pelo servico historico.");
        erro.definitivo = true;
        throw erro;
      }
      recibo = entrada.transacao
        ? await this.publicador.recuperar(entrada.transacao, entrada.apolice)
        : await this.publicador.publicar({
            apolice: entrada.apolice,
            periodo: entrada.periodo,
            ...entrada.payload,
            aoTransmitir: async (tx) => this.fila.marcarTransmitida(entrada, tx),
          });
    } catch (erro) {
      this.fila.marcarErro(entrada, erro);
      if (entrada.estado === ESTADOS.FALHA)
        await this.relatar("relatarFalha", {
          apolice: entrada.apolice,
          periodo: entrada.periodo,
          motivo: descreverErro(erro),
          tentativas: entrada.tentativas,
        });
      return { sucesso: false, erro };
    }
    entrada.auditoriaPendente = true;
    this.fila.marcarConcluida(entrada, recibo);
    try {
      const linha = await this.finalizarAuditoria(entrada);
      return { sucesso: true, recibo, linha };
    } catch (erro) {
      console.warn(`[oraculo] transacao confirmada; auditoria pendente: ${erro.message}`);
      return { sucesso: true, recibo, auditoriaPendente: true };
    }
  }

  /** Falha de auditoria nunca devolve uma transacao confirmada para reenvio. */
  async finalizarAuditoria(entrada) {
    const recibo = entrada.recibo;
    const dados = {
      apolice: entrada.apolice,
      periodo: entrada.periodo,
      ...recibo,
      indiceClimatico: entrada.payload.indiceClimatico,
      indices: { indiceClimatico: entrada.payload.indiceClimatico },
      procedencia: entrada.payload.procedencia,
      tentativas: entrada.tentativas,
    };
    const linha = this.registro.registrar(dados);
    entrada.auditoriaPendente = !(await this.relatar("relatarPublicacao", dados));
    this.fila.salvar();
    return linha;
  }

  /**
   * Relata ao backend, quando houver um.
   *
   * Uma falha aqui NAO desfaz a publicacao: o indice ja esta na cadeia, e a cadeia
   * e a fonte da verdade — o indexador do backend vai encontrar o evento de
   * qualquer forma. O que se perderia seriam os metadados que so o oraculo tem
   * (gas estimado, latencia, procedencia), e eles continuam no registro local.
   */
  async relatar(metodo, dados) {
    if (!this.backend) return true;

    try {
      await this.backend[metodo](dados);
      return true;
    } catch (erro) {
      console.warn(`[oraculo] nao foi possivel relatar ao backend (${metodo}): ${erro.message}`);
      return false;
    }
  }

  /**
   * Publica tudo o que estiver pendente na fila, com espera crescente entre as
   * tentativas (RF21).
   *
   * A espera dobra a cada tentativa. Em rede congestionada, repetir de imediato
   * so multiplica transacoes que vao falhar pelo mesmo motivo.
   *
   * @param {(evento: object) => void} [aoProgredir] Callback de acompanhamento.
   * @returns {Promise<{publicadas: number, falhas: number, detalhes: object[]}>}
   */
  async drenarFila(aoProgredir = () => {}) {
    for (const entrada of this.fila.entradas.filter(
      (e) => e.estado === ESTADOS.CONCLUIDA && e.auditoriaPendente,
    )) {
      try {
        await this.finalizarAuditoria(entrada);
      } catch (erro) {
        console.warn(`[oraculo] auditoria continua pendente: ${erro.message}`);
      }
    }
    const detalhes = [];
    let publicadas = 0;
    let falhas = 0;

    for (;;) {
      const entrada = this.fila.proxima();
      if (!entrada) break;

      if (entrada.tentativas > 0) {
        const espera = this.esperaBaseMs * 2 ** (entrada.tentativas - 1);
        aoProgredir({ tipo: "espera", chave: entrada.chave, ms: espera });
        await new Promise((r) => setTimeout(r, espera));
      }

      const resultado = await this.publicarEntrada(entrada);

      if (resultado.sucesso) {
        publicadas += 1;
        detalhes.push({
          chave: entrada.chave,
          sucesso: true,
          recibo: resultado.recibo,
        });
        aoProgredir({
          tipo: "publicada",
          chave: entrada.chave,
          recibo: resultado.recibo,
        });
      } else {
        aoProgredir({
          tipo: "erro",
          chave: entrada.chave,
          tentativa: entrada.tentativas,
          erro: resultado.erro,
        });

        if (entrada.estado === ESTADOS.FALHA) {
          falhas += 1;
          detalhes.push({
            chave: entrada.chave,
            sucesso: false,
            erro: resultado.erro.message,
          });
        }
      }
    }

    return { publicadas, falhas, detalhes };
  }

  /** Libera a conexao com o no, para que o processo possa terminar. */
  encerrar() {
    this.publicador.encerrar();
  }
}

module.exports = { ServicoOraculo };
