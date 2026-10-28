import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

/**
 * Configuracao do backend.
 *
 * Todo segredo vem de variavel de ambiente (RNF14), gravada pelo `npm start` da
 * raiz. Nenhum valor sensivel tem padrao embutido no codigo.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

dotenv.config({ path: join(RAIZ, ".env"), quiet: true });

export const config = {
  porta: Number(process.env.PORTA || 3001),

  /**
   * Endereco obrigatorio do PostgreSQL no uso. O iniciador da raiz
   * configura o Docker; testes usam bancos PostgreSQL isolados.
   */
  urlDoBanco: process.env.DATABASE_URL || "",

  /** Origem do aplicativo, para o CORS. */
  origemDoAplicativo: process.env.ORIGEM_APP || "http://localhost:5173",

  /** Duracao da sessao, em horas. */
  horasDeSessao: Number(process.env.HORAS_DE_SESSAO || 8),

  /**
   * Chave que o servico de oraculo usa para se autenticar na API. Nao e a
   * chave privada do oraculo na cadeia — essa nunca passa por aqui.
   */
  chaveDeServico: process.env.CHAVE_DE_SERVICO || "",

  /** Rede e enderecos dos contratos, lidos do arquivo de implantacao. */
  rede: process.env.REDE || "sepolia",
  rpcUrl: process.env.RPC_URL || "",
  dirImplantacoes: process.env.DIR_IMPLANTACOES || join(RAIZ, "..", "blockchain", "implantacoes"),

  /** Intervalo entre varreduras do indexador de eventos, em milissegundos. */
  intervaloDoIndexador: Number(process.env.INTERVALO_INDEXADOR_MS || 4000),

  /** Liga o indexador. Os testes desligam, porque nao ha cadeia disponivel. */
  indexadorAtivo: process.env.INDEXADOR !== "desligado",

  /** Limites de requisicao por origem nas rotas sensiveis. */
  limiteDeLogin: Number(process.env.LIMITE_LOGIN || 10),
};

/**
 * Enderecos dos contratos na rede configurada, ou nulo se nao houver implantacao.
 *
 * O backend sobe mesmo sem contrato implantado: cadastro e cotacao nao
 * dependem da cadeia. So o indexador e a verificacao de emissao ficam inativos.
 */
export function lerImplantacao(rede = config.rede) {
  const arquivo = join(config.dirImplantacoes, `${rede}.json`);

  if (!existsSync(arquivo)) return null;

  return JSON.parse(readFileSync(arquivo, "utf8"));
}
