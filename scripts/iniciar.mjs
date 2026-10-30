/** Execução de uso: um PostgreSQL no Docker e uma rede externa, Sepolia. */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executar, raiz } from "./processos.mjs";
import { configuracaoDoBanco, iniciarBanco } from "./banco.mjs";

const carregar = createRequire(path.join(raiz, "blockchain/package.json"));
const { parse } = carregar("dotenv");
const { JsonRpcProvider, Wallet, FetchRequest, Contract } = carregar("ethers");
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
const configBanco = () => configuracaoDoBanco(process.env);

/** Endereco publico da VM, opcional em blockchain/.env; com ele o Caddy serve por HTTPS. */
export function lerDominio(
  env = { ...lerEnv(path.join(raiz, "blockchain/.env")), ...process.env },
) {
  const dominio = (env.DOMINIO ?? "").trim().toLowerCase();
  if (dominio && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(dominio))
    throw new Error("DOMINIO invalido em blockchain/.env. Exemplo: 20-1-2-3.sslip.io");
  return dominio;
}

const compose = (args, ambiente, capturar = false) => {
  const dominio = lerDominio();
  const arquivos = ["docker-compose.yml", ...(dominio ? ["docker-compose.vm.yml"] : [])];
  return executar(
    "docker",
    ["compose", ...arquivos.flatMap((a) => ["--file", path.join(raiz, a)]), ...args],
    { cwd: raiz, env: dominio ? { ...ambiente, DOMINIO: dominio } : ambiente, capturar },
  );
};

export async function verificarRede(
  env = { ...lerEnv(path.join(raiz, "blockchain/.env")), ...process.env },
  m = manifesto(),
) {
  if (!env.RPC_SEPOLIA) throw new Error("Configure RPC_SEPOLIA em blockchain/.env.");
  if (m.versaoProtocolo !== "clima-historico-v4" || m.rede !== "sepolia" || m.chainId !== 11155111)
    throw new Error("Manifesto incompativel com o protocolo historico atual na Sepolia.");
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
    const fabrica = new Contract(
      m.contratos.ApoliceFactory,
      [
        "function registry() view returns (address)",
        "function seguradora() view returns (address)",
      ],
      provedor,
    );
    const registro = new Contract(
      m.contratos.OracleRegistry,
      [
        "function seguradora() view returns (address)",
        "function ehAutorizado(address) view returns (bool)",
      ],
      provedor,
    );
    const [codigoFabrica, codigoRegistro, registry, donaFabrica, donaRegistro, autorizado] =
      await Promise.all([
        provedor.getCode(m.contratos.ApoliceFactory),
        provedor.getCode(m.contratos.OracleRegistry),
        fabrica.registry(),
        fabrica.seguradora(),
        registro.seguradora(),
        registro.ehAutorizado(m.oraculoAutorizado),
      ]);
    if (
      codigoFabrica === "0x" ||
      codigoRegistro === "0x" ||
      registry.toLowerCase() !== m.contratos.OracleRegistry.toLowerCase() ||
      donaFabrica.toLowerCase() !== m.seguradora.toLowerCase() ||
      donaRegistro.toLowerCase() !== m.seguradora.toLowerCase() ||
      !autorizado
    )
      throw new Error("Contratos ou autorizacao do oraculo divergem do manifesto Sepolia.");
    return { env, m };
  } catch {
    // Erros de RPC podem conter o endereco privado do provedor e sua credencial.
    throw new Error(
      "Nao foi possivel confirmar a integracao Sepolia. Confira RPC, contratos e autorizacao do oraculo.",
    );
  } finally {
    provedor.destroy();
  }
}

async function iniciar() {
  const { env, m } = await verificarRede();
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
  // So a chave entre API e oraculo; ela e gerada uma vez e preservada entre execucoes.
  let segredos;
  if (existsSync(arquivoSegredos)) {
    try {
      segredos = JSON.parse(readFileSync(arquivoSegredos, "utf8"));
    } catch {
      throw new Error(
        "Arquivo de segredos invalido. Restaure o arquivo original; nenhuma chave foi substituida.",
      );
    }
    if (typeof segredos?.CHAVE_DE_SERVICO !== "string" || !segredos.CHAVE_DE_SERVICO)
      throw new Error(
        "Arquivo de segredos incompleto. Restaure a chave original; nenhuma foi substituída.",
      );
  } else {
    segredos = { CHAVE_DE_SERVICO: randomBytes(32).toString("hex") };
    writeFileSync(arquivoSegredos, JSON.stringify(segredos), { mode: 0o600, flag: "wx" });
  }
  const url = new URL(banco.url);
  url.hostname = "banco";
  url.port = "5432";
  gravarEnv("api.env", {
    DATABASE_URL: url.href,
    RPC_URL: env.RPC_SEPOLIA,
    CHAVE_DE_SERVICO: segredos.CHAVE_DE_SERVICO,
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
  const texto = (await compose(["ps", "--all", "--format", "json"], banco.ambiente, true)).trim();
  const containers = texto.startsWith("[")
    ? JSON.parse(texto)
    : texto
        .split(/\r?\n/)
        .filter(Boolean)
        .map((linha) => JSON.parse(linha));
  const dominio = lerDominio();
  conferirContainers(containers, dominio);
  const resposta = await fetch("http://127.0.0.1:3001/api/saude", {
    signal: AbortSignal.timeout(5000),
  });
  if (!resposta.ok) throw new Error("API indisponivel na consulta de saude.");
  const saude = await resposta.json();
  const web = await fetch("http://127.0.0.1:5173", { signal: AbortSignal.timeout(5000) });
  const { m } = await verificarRede();
  if (!web.ok) throw new Error("Interface indisponivel.");
  conferirSaude(saude, m);
  console.log(
    "Interface: http://localhost:5173 | API: http://localhost:3001/api | Banco: PostgreSQL | Rede: Sepolia pública de testes.",
  );
  if (dominio) console.log(`Acesso pela internet: https://${dominio}`);
  console.log(
    "Este status não comprova assinatura MetaMask, processamento de apólice ou recebimento de indenização.",
  );
}

/** Exige os servicos do Compose; oraculo e Caddy nao expoem healthcheck HTTP. */
export function conferirContainers(containers, dominio = "") {
  const servicos = ["banco", "api", "oraculo", "interface", ...(dominio ? ["caddy"] : [])];
  for (const servico of servicos) {
    const atual = containers.find((c) => c.Service === servico);
    const semSaude = servico === "oraculo" || servico === "caddy";
    if (atual?.State !== "running" || (!semSaude && atual.Health !== "healthy"))
      throw new Error(`Servico ${servico} indisponivel ou ainda nao saudavel no Docker.`);
  }
}

/** Confere a resposta operacional da API sem confundir servico ativo com sincronizacao correta. */
export function conferirSaude(saude, m) {
  if (
    saude.situacao !== "ok" ||
    saude.banco?.motor !== "postgres" ||
    !saude.cadeia?.contratosImplantados ||
    !saude.indexador?.ativo ||
    saude.indexador.ultimoErro ||
    saude.cadeia?.fabrica?.toLowerCase() !== m.contratos.ApoliceFactory.toLowerCase()
  )
    throw new Error(
      "Integracao incompleta: confira os servicos, a sincronizacao e o manifesto atual.",
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const acao = process.argv[2] || "status";
    if (process.argv.length > 3)
      throw new Error("Use iniciar, parar ou status, sem argumentos adicionais.");
    if (acao === "iniciar") await iniciar();
    else if (acao === "parar") await compose(["stop"], configBanco().ambiente);
    else if (acao === "status") await status();
    else throw new Error("Acao desconhecida. Use iniciar, parar ou status.");
  } catch (erro) {
    console.error(erro.shortMessage || erro.message || "Falha na integracao.");
    process.exitCode = 1;
  }
}
