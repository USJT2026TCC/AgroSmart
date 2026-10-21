import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

/**
 * Configuracao do backend.
 *
 * Todo segredo vem de variavel de ambiente (RNF14). Nenhum valor sensivel tem
 * padrao embutido no codigo: se `CHAVE_DE_SERVICO` ou `SEGREDO_DE_CIFRA` faltar
 * em producao, o servico recusa subir, em vez de rodar com um segredo que esta
 * publicado no repositorio.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = join(AQUI, "..");

dotenv.config({ path: join(RAIZ, ".env"), quiet: true });

const ambiente = process.env.NODE_ENV || "desenvolvimento";
const emProducao = ["producao", "production"].includes(ambiente);

/**
 * Le um segredo obrigatorio. Em desenvolvimento e teste, aceita um valor de
 * demonstracao marcado como tal; em producao, a ausencia derruba o processo.
 */
function segredo(nome, valorDeDesenvolvimento) {
  const valor = process.env[nome];

  if (valor) return valor;

  if (emProducao) {
    throw new Error(`${nome} nao definido. Em producao, todo segredo precisa vir do ambiente.`);
  }

  return valorDeDesenvolvimento;
}

export const config = {
  ambiente,
  emProducao,
  porta: Number(process.env.PORTA || 3001),

  /**
   * HTTPS para as requisicoes da API. Com os dois caminhos
   * definidos, a API so atende em https. Para desenvolver, gere com
   * scripts/gerar-certificados.sh. Em producao, o usual e um proxy reverso com
   * certificado publico na frente da API; o efeito para o RNF17 e o mesmo.
   */
  tlsCertificado: process.env.TLS_CERTIFICADO || "",
  tlsChave: process.env.TLS_CHAVE || "",

  /**
   * Endereco obrigatorio do PostgreSQL/PostGIS no uso. O iniciador da raiz
   * configura o Docker; banco em memoria e reservado aos testes.
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
  chaveDeServico: segredo("CHAVE_DE_SERVICO", "desenvolvimento-apenas-nao-use-em-producao"),

  /** Rede e enderecos dos contratos, lidos do arquivo de implantacao. */
  rede: process.env.REDE || "sepolia",
  rpcUrl: process.env.RPC_URL || "",
  dirImplantacoes: process.env.DIR_IMPLANTACOES || join(RAIZ, "..", "contratos", "implantacoes"),

  /** Intervalo entre varreduras do indexador de eventos, em milissegundos. */
  intervaloDoIndexador: Number(process.env.INTERVALO_INDEXADOR_MS || 4000),

  /** Liga o indexador. Os testes desligam, porque nao ha cadeia disponivel. */
  indexadorAtivo: process.env.INDEXADOR !== "desligado",

  /**
   * E-mail (RF27). Sem SMTP_URL, as mensagens vao para a caixa de saida local,
   * em arquivos .eml. Ex.: smtps://usuario:senha@smtp.exemplo.com:465
   */
  smtpUrl: process.env.SMTP_URL || "",
  remetenteEmail: process.env.EMAIL_REMETENTE || "AgroSmart <avisos@agrosmart.test>",
  dirEmails: process.env.DIR_EMAILS || join(RAIZ, "dados", "emails"),
  intervaloDoEmail: Number(process.env.INTERVALO_EMAIL_MS || 15000),
  emailAtivo: process.env.EMAIL !== "desligado",

  /** Explorador de blocos, para o link da transacao no e-mail. Vazio em rede local. */
  exploradorDeBlocos:
    process.env.EXPLORADOR_DE_BLOCOS ??
    ((process.env.REDE || "sepolia") === "sepolia" ? "https://sepolia.etherscan.io" : ""),

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
