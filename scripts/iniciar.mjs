import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { executar, raiz } from "./processos.mjs";
import {
  ambienteDoBanco,
  configuracaoDoBanco,
  iniciarBanco,
} from "./banco.mjs";

const estadoDir = path.join(raiz, ".execucao");
const estadoArquivo = path.join(estadoDir, "estado.json");
const acao = process.argv[2] || "status";
const requireContratosConfig = createRequire(
  path.join(raiz, "contratos", "package.json"),
);
function configuracaoSepolia() {
  const { parse } = requireContratosConfig("dotenv");
  const e = parse(readFileSync(path.join(raiz, "contratos", ".env")));
  if (!e.RPC_SEPOLIA || !e.CHAVE_PRIVADA_ORACULO)
    throw new Error(
      "Configure RPC_SEPOLIA e CHAVE_PRIVADA_ORACULO em contratos/.env.",
    );
  const implantacao = JSON.parse(
    readFileSync(path.join(raiz, "contratos", "implantacoes", "sepolia.json")),
  );
  if (
    implantacao.legado ||
    !["clima-integral-v1", "clima-integral-historico-v2"].includes(
      implantacao.versaoProtocolo,
    )
  )
    throw new Error("Implantacao Sepolia atual ausente.");
  const { Wallet } = requireContratosConfig("ethers");
  if (
    new Wallet(e.CHAVE_PRIVADA_ORACULO).address.toLowerCase() !==
    implantacao.oraculoAutorizado.toLowerCase()
  )
    throw new Error("Chave do oraculo nao corresponde a implantacao Sepolia.");
  return {
    rpc: e.RPC_SEPOLIA,
    chave: e.CHAVE_PRIVADA_ORACULO,
    fabrica: implantacao.contratos.ApoliceFactory,
    instanciaDados: /^sepolia-0x[0-9a-f]{40}$/.test(
      implantacao.instanciaDados ?? "",
    )
      ? implantacao.instanciaDados
      : null,
  };
}
let rpcAlvo = "http://127.0.0.1:8545";
async function rpc(metodo, parametros = []) {
  const resposta = await fetch(rpcAlvo, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: metodo,
      params: parametros,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await resposta.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}
async function aguardar(teste, descricao) {
  const fim = Date.now() + 180000;
  while (Date.now() < fim) {
    try {
      if (await teste()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Tempo esgotado: ${descricao}. Confira os logs em .execucao.`,
  );
}
async function livre(porta) {
  await new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.once("error", () =>
      reject(
        new Error(
          `Porta ${porta} ocupada. Encerre a instancia anterior antes de iniciar.`,
        ),
      ),
    );
    servidor.listen(porta, () => servidor.close(resolve));
  });
}
function lerEstado() {
  return JSON.parse(readFileSync(estadoArquivo, "utf8"));
}

if (acao === "status") {
  try {
    const e = lerEstado();
    rpcAlvo = configuracaoSepolia().rpc;
    const saude = await (
      await fetch("http://localhost:3001/api/saude", {
        signal: AbortSignal.timeout(3000),
      })
    ).json();
    const rede = Number(BigInt(await rpc("eth_chainId")));
    const codigo = await rpc("eth_getCode", [saude.cadeia.fabrica, "latest"]);
    const web = await fetch("http://localhost:5173", {
      signal: AbortSignal.timeout(3000),
    });
    const oraculo = e.processos.find((p) => p.nome === "oraculo");
    if (!oraculo) throw new Error("Oraculo nao registrado");
    process.kill(oraculo.pid, 0);
    if (
      rede !== 11155111 ||
      !codigo ||
      codigo === "0x" ||
      !web.ok ||
      !saude.indexador.ativo
    )
      throw new Error("Fluxo incompleto: confira .execucao e o indexador.");
    console.log(
      `Interface: http://localhost:5173 | API e banco (${saude.banco.motor}): conectados | Blockchain: ${rede} | Fabrica: codigo presente | Indexador: ativo | Oraculo: processo ativo`,
    );
    console.log(
      "MetaMask: confirme a extensao no navegador e selecione a mesma rede. Status nao valida a extensao nem pagamentos.",
    );
  } catch (erro) {
    console.error(
      `Sistema indisponivel ou incompleto: ${erro.message}. Inicie com npm start.`,
    );
    process.exitCode = 1;
  }
} else if (acao === "parar") {
  try {
    const e = lerEstado();
    if (!e.controle || e.raiz !== raiz)
      throw new Error("Instancia nao gerenciada por esta versao do iniciador.");
    writeFileSync(
      path.join(estadoDir, "parar.json"),
      JSON.stringify({ controle: e.controle }),
    );
    console.log(
      "Encerramento solicitado ao AgroSmart. Dados preservados. Se usar Docker, npm run banco:parar interrompe o banco sem apagar o volume.",
    );
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
} else if (acao === "iniciar") {
  const filhos = [];
  let encerrando = false;
  let vigia = null;
  const encerrar = () => {
    if (encerrando) return;
    encerrando = true;
    if (vigia) clearInterval(vigia);
    for (const filho of [...filhos].reverse())
      if (filho.exitCode === null) filho.kill("SIGTERM");
  };
  process.once("SIGINT", encerrar);
  process.once("SIGTERM", encerrar);
  try {
    for (const porta of [3001, 5173]) await livre(porta);
    const publica = configuracaoSepolia();
    rpcAlvo = publica.rpc;
    if (Number(BigInt(await rpc("eth_chainId"))) !== 11155111)
      throw new Error("O RPC informado nao e Sepolia.");
    mkdirSync(estadoDir, { recursive: true });
    const instancia =
      publica.instanciaDados ?? `sepolia-${publica.fabrica.toLowerCase()}`;
    const banco = configuracaoDoBanco(ambienteDoBanco());
    console.log(
      banco.docker
        ? "Iniciando PostgreSQL/PostGIS no Docker..."
        : "Usando PostgreSQL configurado em DATABASE_URL.",
    );
    await iniciarBanco(banco);
    const env = {
      ...process.env,
      NODE_ENV: "desenvolvimento",
      REDE: "sepolia",
      RPC_URL: rpcAlvo,
      API_URL: "http://localhost:3001/api",
      DATABASE_URL: banco.url,
      DIR_DADOS: path.join(estadoDir, instancia, "oraculo"),
      DIR_IMPLANTACOES: path.join(raiz, "contratos", "implantacoes"),
      CHAVE_PRIVADA_ORACULO: publica.chave,
      CHAVE_DE_SERVICO: randomBytes(32).toString("hex"),
      PORTA: "3001",
      INDEXADOR: "ligado",
      EMAIL: "desligado",
      TLS_CERTIFICADO: "",
      TLS_CHAVE: "",
      VITE_API_ALVO: "http://localhost:3001",
      VITE_REDE: "sepolia",
    };
    const processos = [];
    const controle = randomBytes(16).toString("hex");
    function iniciar(nome, modulo, argumentos, descartar = false) {
      const fd = descartar
        ? null
        : openSync(path.join(estadoDir, `${nome}.log`), "w");
      const ambienteFilho = { ...env };
      if (nome !== "oraculo") delete ambienteFilho.CHAVE_PRIVADA_ORACULO;
      if (nome === "app") delete ambienteFilho.CHAVE_DE_SERVICO;
      if (nome !== "backend") {
        delete ambienteFilho.DATABASE_URL;
      }
      const filho = spawn(process.execPath, argumentos, {
        cwd: path.join(raiz, modulo),
        env: ambienteFilho,
        windowsHide: true,
        stdio: descartar ? "ignore" : ["ignore", fd, fd],
      });
      if (fd !== null) closeSync(fd);
      filhos.push(filho);
      processos.push({ nome, pid: filho.pid });
      filho.once("error", (erro) => {
        console.error(`${nome}: ${erro.message}`);
        encerrar();
        process.exitCode = 1;
      });
      filho.once("exit", (codigo) => {
        if (!encerrando) {
          console.error(
            `${nome} encerrou (${codigo}). Confira .execucao/${nome}.log`,
          );
          encerrar();
          process.exitCode = 1;
        }
      });
      return filho;
    }
    await executar(process.execPath, ["scripts/sincronizar-enderecos.mjs"], {
      cwd: path.join(raiz, "app"),
      env,
    });
    console.log("Iniciando API e indexador com PostgreSQL...");
    iniciar("backend", "backend", ["src/index.js"]);
    await aguardar(
      async () =>
        (
          await fetch("http://localhost:3001/api/saude", {
            signal: AbortSignal.timeout(2000),
          })
        ).ok,
      "API",
    );
    iniciar("oraculo", "oraculo", [
      "src/index.js",
      "servico",
      "--intervalo",
      "5000",
    ]);
    iniciar("app", "app", [
      path.join(
        path.dirname(
          createRequire(path.join(raiz, "app/package.json")).resolve(
            "vite/package.json",
          ),
        ),
        "bin/vite.js",
      ),
      "--host",
      "localhost",
    ]);
    await aguardar(
      async () =>
        (
          await fetch("http://localhost:5173", {
            signal: AbortSignal.timeout(2000),
          })
        ).ok,
      "interface",
    );
    writeFileSync(
      estadoArquivo,
      JSON.stringify(
        {
          raiz,
          rede: "sepolia",
          instancia,
          processos,
          controle,
        },
        null,
        2,
      ),
    );
    vigia = setInterval(() => {
      const sinal = path.join(estadoDir, "parar.json");
      if (!existsSync(sinal)) return;
      try {
        const pedido = JSON.parse(readFileSync(sinal, "utf8"));
        if (pedido.controle === controle) {
          unlinkSync(sinal);
          encerrar();
        }
      } catch (erro) {
        console.error(
          `Nao foi possivel ler o pedido de encerramento: ${erro.message}`,
        );
      }
    }, 500);
    console.log(
      "AgroSmart: http://localhost:5173 — Sepolia. Use MetaMask no navegador. npm stop encerra os servicos. O banco e a fila desta implantacao sao preservados.",
    );
  } catch (erro) {
    console.error(erro.message);
    encerrar();
    process.exitCode = 1;
  }
} else {
  console.error("Acao desconhecida");
  process.exitCode = 1;
}
