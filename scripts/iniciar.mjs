/** Execução de uso: um PostgreSQL no Docker e uma rede externa, Sepolia. */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { executar, raiz } from "./processos.mjs";
import { ambienteDoBanco, configuracaoDoBanco, iniciarBanco } from "./banco.mjs";

const carregar = createRequire(path.join(raiz, "blockchain/package.json"));
const { parse } = carregar("dotenv");
const { JsonRpcProvider, Wallet, FetchRequest } = carregar("ethers");
const pasta = path.join(raiz, ".execucao");
const manifesto = () =>
  JSON.parse(readFileSync(path.join(raiz, "blockchain/implantacoes/sepolia.json"), "utf8"));
const lerEnv = (arquivo) => (existsSync(arquivo) ? parse(readFileSync(arquivo)) : {});
const gravarEnv = (nome, valores) =>
  writeFileSync(
    path.join(pasta, nome),
    Object.entries(valores)
      .map(([k, v]) => `${k}=${JSON.stringify(String(v))}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
const configBanco = () => {
  const ambiente = ambienteDoBanco();
  // A instalação operacional tem um único banco, gerenciado pelo Compose.
  const esperado = configuracaoDoBanco({ ...ambiente, DATABASE_URL: "" });
  if (ambiente.DATABASE_URL && ambiente.DATABASE_URL !== esperado.url)
    throw new Error(
      "DATABASE_URL aponta para outro banco. Use o PostgreSQL deste Compose; bancos isolados são exclusivos dos testes.",
    );
  return esperado;
};
const compose = (args, ambiente) =>
  executar("docker", ["compose", "--file", path.join(raiz, "docker-compose.yml"), ...args], {
    cwd: raiz,
    env: ambiente,
  });

async function verificarRede() {
  const env = { ...lerEnv(path.join(raiz, "blockchain/.env")), ...process.env };
  if (!env.RPC_SEPOLIA) throw new Error("Configure RPC_SEPOLIA em blockchain/.env.");
  const m = manifesto();
  const requisicao = new FetchRequest(env.RPC_SEPOLIA);
  requisicao.timeout = 15000;
  requisicao.retryFunc = async () => false;
  const provedor = new JsonRpcProvider(requisicao, 11155111, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
  try {
    if (
      Number(BigInt(await provedor.send("eth_chainId", []))) !== 11155111 ||
      m.chainId !== 11155111
    )
      throw new Error("RPC e manifesto precisam corresponder à Sepolia.");
    if ((await provedor.getCode(m.contratos.ApoliceFactory)) === "0x")
      throw new Error("Fábrica não encontrada na Sepolia.");
    return { env, m };
  } finally {
    provedor.destroy();
  }
}

async function iniciar() {
  const { env, m } = await verificarRede();
  if (m.versaoProtocolo !== "clima-historico-v4")
    throw new Error("Falta implantar e verificar a fábrica histórica atual na Sepolia.");
  if (
    !env.CHAVE_PRIVADA_ORACULO ||
    new Wallet(env.CHAVE_PRIVADA_ORACULO).address.toLowerCase() !==
      m.oraculoAutorizado.toLowerCase()
  )
    throw new Error("CHAVE_PRIVADA_ORACULO ausente ou incompatível com o registro público.");
  const banco = configBanco();
  await iniciarBanco(banco);
  mkdirSync(pasta, { recursive: true });
  const arquivoSegredos = path.join(pasta, "segredos.json");
  const antigos = lerEnv(path.join(raiz, "api/.env"));
  // So a chave entre API e oraculo; ela e gerada uma vez e preservada entre execucoes.
  let segredos;
  if (existsSync(arquivoSegredos)) {
    segredos = JSON.parse(readFileSync(arquivoSegredos, "utf8"));
    if (!segredos.CHAVE_DE_SERVICO)
      throw new Error(
        "Arquivo de segredos incompleto. Restaure a chave original; nenhuma foi substituída.",
      );
  } else {
    segredos = { CHAVE_DE_SERVICO: antigos.CHAVE_DE_SERVICO || randomBytes(32).toString("hex") };
    writeFileSync(arquivoSegredos, JSON.stringify(segredos), { mode: 0o600, flag: "wx" });
  }
  const url = new URL(banco.url);
  url.hostname = "banco";
  url.port = "5432";
  gravarEnv("api.env", {
    NODE_ENV: "demonstracao",
    DATABASE_URL: url.href,
    RPC_URL: env.RPC_SEPOLIA,
    CHAVE_DE_SERVICO: segredos.CHAVE_DE_SERVICO,
    INDEXADOR: "ligado",
    ORIGEM_APP: "http://localhost:5173",
  });
  gravarEnv("oraculo.env", {
    RPC_URL: env.RPC_SEPOLIA,
    CHAVE_PRIVADA_ORACULO: env.CHAVE_PRIVADA_ORACULO,
    CHAVE_DE_SERVICO: segredos.CHAVE_DE_SERVICO,
  });
  const destinoFila = path.join(pasta, "oraculo");
  mkdirSync(destinoFila, { recursive: true });
  await compose(["build", "api"], banco.ambiente);
  await compose(["up", "--detach", "--wait", "--wait-timeout", "180"], banco.ambiente);
  await status(banco);
}

async function status(banco = configBanco()) {
  await compose(["ps"], banco.ambiente);
  const saude = await (
    await fetch("http://127.0.0.1:3001/api/saude", {
      signal: AbortSignal.timeout(5000),
    })
  ).json();
  const web = await fetch("http://127.0.0.1:5173", {
    signal: AbortSignal.timeout(5000),
  });
  const { m } = await verificarRede();
  if (
    !web.ok ||
    !saude.indexador?.ativo ||
    saude.cadeia?.fabrica?.toLowerCase() !== m.contratos.ApoliceFactory.toLowerCase()
  )
    throw new Error("Integração incompleta: confira docker compose logs e o manifesto atual.");
  console.log(
    "Interface: http://localhost:5173 | API: http://localhost:3001/api | Banco: PostgreSQL | Rede: Sepolia pública de testes.",
  );
  console.log(
    "Este status não comprova assinatura MetaMask, processamento de apólice ou recebimento de indenização.",
  );
}

try {
  const acao = process.argv[2] || "status";
  if (acao === "iniciar") await iniciar();
  else if (acao === "parar") await compose(["stop"], configBanco().ambiente);
  else if (acao === "status") await status();
  else throw new Error("Ação desconhecida.");
} catch (erro) {
  // Não imprimir objetos de configuração: contêm segredos.
  console.error(
    erro.shortMessage ||
      erro.message ||
      "Falha na integração. Confira a disponibilidade do RPC e os serviços Docker.",
  );
  process.exitCode = 1;
}
