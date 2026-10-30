"use strict";

const path = require("node:path");

const limites = require("../../configuracao/historico.json");

const { config, exigirChave, lerImplantacao } = require("./config");
const { FilaDePublicacoes, ESTADOS } = require("./fila");
const { Publicador } = require("./publicador");
const { ClienteBackend } = require("./clienteBackend");
const { avaliarHistorico } = require("./historico");
const { conferirVinculo } = require("./vinculoHistorico");
const { conferirSerie } = require("./serieHistorica");

/**
 * Servico de oraculo do AgroSmart.
 *
 * Amarra as quatro pecas que fazem a travessia acontecer:
 *   serie historica verificada -> fila -> publicador -> relato a API
 *
 * O índice é salvo na fila antes do envio. A confirmação marca a entrada como
 * concluída, preservando seu histórico. Relatos ainda não entregues à API ficam
 * pendentes e são retomados nos ciclos seguintes.
 */
class ServicoOraculo {
  constructor({ publicador, fila, backend = null, opcoes = {} }) {
    this.publicador = publicador;

    // O servico operacional consulta dados no backend e relata suas publicacoes.
    this.backend = backend;
    this.fila = fila;

    this.esperaBaseMs = opcoes.esperaBaseMs ?? config.esperaBaseMs;
    if (!Number.isInteger(this.esperaBaseMs) || this.esperaBaseMs < 0 || this.esperaBaseMs > 60000)
      throw new Error("ESPERA_BASE_MS deve ser inteiro entre 0 e 60000.");
    this.dirPacote = opcoes.dirPacote;
  }

  async prepararHistorico(apolice) {
    if (!this.backend) throw new Error("O modo historico exige backend autenticado.");
    const resposta = await this.backend.serieHistorica(apolice);
    const { termos, linhas } = resposta;
    const cadeia = await this.publicador.termosHistoricos(apolice);
    conferirVinculo(resposta, cadeia);
    conferirSerie(linhas, termos, this.dirPacote);
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
        estacao: limites.estacao,
        hashSerie: termos.hashSerie,
        inicio: resultado.inicio,
        fim: resultado.fim,
        diasValidos: resultado.diasValidos,
        diasIncompletos: resultado.diasIncompletos,
        contagem: "inicio-da-cobertura",
        parametroExperimental: true,
      },
    };
    if (await this.publicador.periodoJaPublicado(apolice, periodo))
      return { apolice, periodo, estado: "ja-publicada" };
    return this.fila.enfileirar({ apolice, periodo, payload }).entrada;
  }

  /** Monta o servico a partir da configuracao de ambiente. */
  static criar() {
    // O chainId vem do arquivo de implantacao. Informa-lo dispensa a deteccao
    // automatica de rede do ethers, que com o no fora do ar fica repetindo a
    // consulta antes de desistir.
    const { chainId } = lerImplantacao();

    return new ServicoOraculo({
      publicador: new Publicador({
        rpcUrl: config.rpcUrl,
        chavePrivada: exigirChave(),
        confirmacoes: config.confirmacoes,
        timeoutMs: config.timeoutMs,
        chainId,
      }),
      fila: new FilaDePublicacoes(path.join(config.dirDados, "fila.json"), {
        maxTentativas: config.maxTentativas,
      }),
      backend:
        config.apiUrl && config.chaveDeServico
          ? new ClienteBackend({
              url: config.apiUrl,
              chave: config.chaveDeServico,
              timeoutMs: config.timeoutMs,
            })
          : null,
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
      recibo = entrada.transacao
        ? await this.publicador.recuperar(entrada.transacao)
        : await this.publicador.publicar({
            apolice: entrada.apolice,
            periodo: entrada.periodo,
            ...entrada.payload,
            aoTransmitir: async (tx) => this.fila.marcarTransmitida(entrada, tx),
          });
    } catch (erro) {
      this.fila.marcarErro(entrada, erro);
      if (entrada.estado === ESTADOS.FALHA) await this.relatarFalha(entrada);
      return { sucesso: false, erro };
    }
    entrada.relatoPendente = true;
    this.fila.marcarConcluida(entrada, recibo);
    await this.relatarPublicacao(entrada);
    return { sucesso: true, recibo };
  }

  /** A falha é terminal para a publicação, mas seu aviso à API pode ser repetido. */
  async relatarFalha(entrada) {
    entrada.relatoFalhaPendente = !(await this.relatar("relatarFalha", {
      apolice: entrada.apolice,
      periodo: entrada.periodo,
      motivo: entrada.ultimoErro.mensagem,
      tentativas: entrada.tentativas,
    }));
    this.fila.salvar();
  }

  /** Falha no relato nunca devolve uma transacao confirmada para reenvio. */
  async relatarPublicacao(entrada) {
    const { txHash, gasUsado, enviadoEm, confirmadoEm, recuperada } = entrada.recibo;
    entrada.relatoPendente = !(await this.relatar("relatarPublicacao", {
      apolice: entrada.apolice,
      periodo: entrada.periodo,
      txHash,
      indiceClimatico: entrada.payload.indiceClimatico,
      gasUsado,
      enviadoEm,
      confirmadoEm,
      recuperada,
      procedencia: entrada.payload.procedencia,
    }));
    this.fila.salvar();
  }

  /**
   * Relata ao backend, quando houver um.
   *
   * Uma falha aqui NAO desfaz a publicacao: o indice ja esta na cadeia, e a cadeia
   * e a fonte da verdade — o indexador do backend vai encontrar o evento de
   * qualquer forma. Se a API estiver fora do ar, o relato e repetido no proximo
   * ciclo; se ela recusar os dados (400 ou 409), repetir daria a mesma resposta.
   */
  async relatar(metodo, dados) {
    if (!this.backend) return true;

    try {
      await this.backend[metodo](dados);
      return true;
    } catch (erro) {
      const recusado = erro.status === 400 || erro.status === 409;
      console.warn(
        `[oraculo] ${recusado ? "relato recusado pela API" : "nao foi possivel relatar ao backend"} (${metodo}): ${erro.message}`,
      );
      return recusado;
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
      (e) => e.estado === ESTADOS.FALHA && e.relatoFalhaPendente,
    ))
      await this.relatarFalha(entrada);
    for (const entrada of this.fila.entradas.filter(
      (e) => e.estado === ESTADOS.CONCLUIDA && e.relatoPendente,
    ))
      await this.relatarPublicacao(entrada);
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
