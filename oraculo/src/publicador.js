"use strict";

const { ethers } = require("ethers");

const { ABI_APOLICE, ABI_REGISTRY } = require("./abi");

/**
 * Travessia da fronteira: assina e submete os indices a cadeia (RF19, RF22).
 *
 * Esta e a unica classe do servico que fala com a rede. A separacao e proposital:
 * a regra historica fica em `historico.js`, testavel sem blockchain, e
 * aqui ficam apenas assinatura, envio e leitura do recibo.
 *
 * A chave privada vem de variavel de ambiente e nunca e escrita em log (RNF14).
 */
class Publicador {
  /**
   * @param {object} opcoes
   * @param {string} opcoes.rpcUrl Endpoint JSON-RPC da rede.
   * @param {string} opcoes.chavePrivada Chave do endereco autorizado no registro.
   * @param {number} [opcoes.confirmacoes=1] Confirmacoes aguardadas.
   */
  constructor({ rpcUrl, chavePrivada, confirmacoes = 1, timeoutMs = 10_000, chainId = null }) {
    if (!rpcUrl) throw new Error("Publicador exige rpcUrl");
    if (!Number.isInteger(confirmacoes) || confirmacoes < 1 || confirmacoes > 100)
      throw new Error("CONFIRMACOES deve ser inteiro entre 1 e 100.");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
      throw new Error("TIMEOUT_MS deve ser inteiro positivo.");
    if (!chavePrivada) throw new Error("Publicador exige a chave privada do oraculo");

    // O tempo limite padrao do ethers para uma requisicao e de 300 segundos, e
    // na deteccao inicial de rede ele ainda repete a tentativa varias vezes. Com
    // o no fora do ar, o servico simplesmente travaria, em vez de falhar e
    // devolver a publicacao a fila. Como o RNF20 exige que a indisponibilidade da
    // rede nao cause perda de dados, o que importa aqui e falhar rapido: a
    // entrada continua na fila e a proxima tentativa vem com espera crescente.
    const requisicao = new ethers.FetchRequest(rpcUrl);
    requisicao.timeout = timeoutMs;
    requisicao.retryFunc = async () => false;

    this.provider = new ethers.JsonRpcProvider(requisicao, chainId ?? undefined, {
      staticNetwork: Boolean(chainId),
      batchMaxCount: 1,
    });

    this.signatario = new ethers.Wallet(chavePrivada, this.provider);

    // O oraculo publica varios periodos em sequencia. Consultar o nonce na rede a
    // cada envio nao funciona: entre duas publicacoes seguidas, o no ainda nao
    // contabilizou a transacao anterior e devolve o mesmo numero, o que faz a
    // segunda transacao ser recusada com "nonce has already been used".
    // O NonceManager mantem a contagem localmente e resolve isso.
    this.carteira = new ethers.NonceManager(this.signatario);
    this.confirmacoes = confirmacoes;
    this.chainIdEsperado = chainId;
    this.timeoutConfirmacaoMs = Math.max(timeoutMs, 180000);
  }

  /** Endereco publico do oraculo. Seguro para log; a chave privada nunca e exposta. */
  get endereco() {
    return this.signatario.address;
  }

  /** Saldo do oraculo, em wei. Sem saldo, nenhuma publicacao acontece. */
  async saldo() {
    return this.provider.getBalance(this.signatario.address);
  }

  /**
   * Confere se este oraculo continua autorizado no registro (RF18).
   *
   * Vale checar antes de montar uma transacao: a seguradora pode ter revogado o
   * endereco, e descobrir isso por uma revert custa gas a toa.
   */
  async estaAutorizado(enderecoRegistry) {
    const registry = new ethers.Contract(enderecoRegistry, ABI_REGISTRY, this.provider);

    return registry.ehAutorizado(this.signatario.address);
  }

  /**
   * Libera a conexao com o no.
   *
   * O provedor mantem um temporizador interno de sondagem. Sem esta chamada, um
   * comando de linha de comando termina de imprimir o resultado e nao devolve o
   * terminal: o processo continua vivo por causa do temporizador.
   */
  encerrar() {
    this.provider.destroy();
  }

  async termosHistoricos(endereco) {
    const c = new ethers.Contract(endereco, ABI_APOLICE, this.provider);
    if (!(await c.modoHistorico())) throw new Error("Contrato nao e historico.");
    return c.verTermos();
  }

  /** Se o periodo ja foi publicado nessa apolice (RF20). */
  async periodoJaPublicado(enderecoApolice, periodo) {
    const apolice = new ethers.Contract(enderecoApolice, ABI_APOLICE, this.provider);

    return apolice.periodoPublicado(periodo);
  }

  /** Confere que o RPC aponta para a rede do manifesto (Sepolia). */
  async conferirRede() {
    const id = Number(BigInt(await this.provider.send("eth_chainId", [])));
    if (id !== Number(this.chainIdEsperado ?? 11155111))
      throw new Error("RPC em rede incompativel; publicacao bloqueada.");
  }

  /** Retoma uma transacao conhecida sem transmitir outra. */
  async recuperar(transacao) {
    await this.conferirRede();
    const recibo = await this.provider.getTransactionReceipt(transacao.txHash);
    if (
      !recibo ||
      Number(BigInt(await this.provider.send("eth_blockNumber", []))) - recibo.blockNumber + 1 <
        this.confirmacoes
    )
      throw new Error(
        "Transacao transmitida ainda sem confirmacoes suficientes; nenhum reenvio foi feito.",
      );
    if (Number(recibo.status) !== 1) {
      const erro = new Error("Transacao transmitida foi revertida.");
      erro.definitivo = true;
      throw erro;
    }
    return this.montarRecibo(recibo, { ...transacao, recuperada: true });
  }

  montarRecibo(recibo, transacao) {
    return {
      recuperada: Boolean(transacao.recuperada),
      txHash: recibo.hash,
      gasUsado: recibo.gasUsed,
      enviadoEm: transacao.enviadoEm,
      confirmadoEm: new Date().toISOString(),
    };
  }

  /**
   * Publica o indice do periodo em uma unica transacao (RF19).
   *
   * A chamada e simulada com `staticCall` antes do envio. Isso antecipa as
   * rejeicoes previsiveis — endereco revogado, periodo duplicado, apolice fora de
   * vigencia — sem gastar gas, e devolve o erro customizado do contrato ja
   * decodificado, em vez de um seletor de quatro bytes.
   *
   * @returns {Promise<object>} Recibo com txHash, gas usado e horarios de envio e confirmacao.
   */
  async publicar({
    apolice: enderecoApolice,
    periodo,
    indiceClimatico,
    aoTransmitir = async () => {},
  }) {
    await this.conferirRede();
    const apolice = new ethers.Contract(enderecoApolice, ABI_APOLICE, this.carteira);

    let recibo;
    let enviadoEm;

    try {
      // Ensaio sem custo. Se a transacao fosse reverter, o erro aparece aqui.
      await apolice.publicarIndices.staticCall(periodo, indiceClimatico);

      enviadoEm = new Date().toISOString();
      const transacao = await apolice.publicarIndices(periodo, indiceClimatico);

      await aoTransmitir({ txHash: transacao.hash, enviadoEm });
      recibo = await transacao.wait(this.confirmacoes, this.timeoutConfirmacaoMs);
    } catch (erro) {
      // O NonceManager ja pode ter incrementado a contagem local para uma
      // transacao que nunca chegou a rede. Sem devolver o contador ao valor real,
      // toda tentativa seguinte herdaria o desalinhamento.
      this.carteira.reset();
      throw erro;
    }

    return this.montarRecibo(recibo, { enviadoEm });
  }
}

module.exports = { Publicador };
