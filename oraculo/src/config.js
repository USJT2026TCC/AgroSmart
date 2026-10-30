"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Configuracao do servico de oraculo.
 *
 * Todo segredo vem de variavel de ambiente, nunca do codigo (RNF14). O `npm start`
 * da raiz grava as variaveis em .execucao/oraculo.env e o Docker as entrega ao servico.
 *
 * Os enderecos dos contratos vem de `blockchain/implantacoes/<rede>.json`, gerado
 * pelo script de implantacao. Copiar endereco a mao entre terminal e arquivo de
 * configuracao e uma das formas mais comuns de quebrar esse tipo de projeto.
 */

const RAIZ = path.join(__dirname, "..");

const config = {
  rede: process.env.REDE || "sepolia",
  rpcUrl: process.env.RPC_URL || "",
  chavePrivada: process.env.CHAVE_PRIVADA_ORACULO || "",

  /** Diretorio da fila de publicacoes. */
  dirDados: path.resolve(RAIZ, process.env.DIR_DADOS || "dados"),

  /** Onde o script de implantacao dos contratos grava os enderecos. */
  dirImplantacoes:
    process.env.DIR_IMPLANTACOES || path.join(RAIZ, "..", "blockchain", "implantacoes"),

  /** Tentativas de publicacao antes de a entrada da fila ser marcada como falha (RF21). */
  maxTentativas: Number(process.env.MAX_TENTATIVAS || 5),

  /** Espera inicial entre tentativas, em milissegundos. Dobra a cada tentativa. */
  esperaBaseMs: Number(process.env.ESPERA_BASE_MS || 2000),

  /** Confirmacoes aguardadas antes de considerar a publicacao concluida. */
  confirmacoes: Number(process.env.CONFIRMACOES || 1),

  /**
   * Tempo limite de cada requisicao ao no, em milissegundos.
   *
   * O padrao do ethers e de 300 segundos. Com o no fora do ar, isso faria o
   * servico travar em vez de devolver a publicacao a fila e tentar de novo mais
   * tarde, que e o comportamento exigido pelo RNF20.
   */
  timeoutMs: Number(process.env.TIMEOUT_MS || 10000),

  /** API autenticada obrigatoria ao modo servico. Nao ha fonte simulada de uso. */
  apiUrl: process.env.API_URL || "",
  chaveDeServico: process.env.CHAVE_DE_SERVICO || "",

  /** Intervalo entre ciclos do modo servico, em milissegundos. */
  intervaloDoServicoMs: Number(process.env.INTERVALO_SERVICO_MS || 60000),
};

/**
 * Le os enderecos implantados na rede configurada.
 * @returns {{contratos: {OracleRegistry: string, ApoliceFactory: string}, oraculoAutorizado: string}}
 */
function lerImplantacao() {
  const arquivo = path.join(config.dirImplantacoes, `${config.rede}.json`);

  if (!fs.existsSync(arquivo)) {
    throw new Error(
      `Implantacao nao encontrada em ${arquivo}. ` +
        "Confira blockchain/implantacoes ou publique os contratos com npm run implantar:sepolia --workspace blockchain.",
    );
  }

  return JSON.parse(fs.readFileSync(arquivo, "utf8"));
}

/**
 * Valida o que e indispensavel para publicar em rede.
 * @throws {Error} quando falta a chave privada do oraculo.
 */
function exigirChave() {
  if (!config.chavePrivada) {
    throw new Error(
      "CHAVE_PRIVADA_ORACULO nao definida. Preencha blockchain/.env e rode npm start na raiz. " +
        "A chave nunca deve ser escrita no codigo nem enviada ao repositorio.",
    );
  }

  return config.chavePrivada;
}

module.exports = { config, lerImplantacao, exigirChave };
