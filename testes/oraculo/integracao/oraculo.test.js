"use strict";
const { criarTemporario } = require("../fixtures/temporario.cjs");

/**
 * Integracao do oraculo contra uma blockchain de verdade.
 *
 * Os testes unitarios usam publicador e backend falsos. O publicador, porem,
 * conversa com o no — ensaia a chamada, estima o gas, envia, espera a
 * confirmacao, decodifica eventos —, e um falso so testaria o falso. Aqui o teste:
 *
 *   1. sobe um `hardhat node` proprio, em porta separada;
 *   2. implanta os contratos a partir dos artefatos de compilacao;
 *   3. roda os COMANDOS do oraculo como o operador rodaria, em processos
 *      separados, com ambiente isolado (sem o .env local);
 *   4. exercita o publicador direto: vigencia e escuta de eventos.
 *
 * Roda com `npm run testar:integracao`. Fica fora da suite principal porque
 * depende dos artefatos compilados em `contratos/` e leva alguns segundos.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { ethers } = require("ethers");

const CONTRATOS = path.join(__dirname, "..", "..", "..", "contratos");
const ORACULO = path.join(__dirname, "..", "..", "..", "oraculo");
const PORTA = 8598;
const RPC = `http://127.0.0.1:${PORTA}`;
const FRASE = "test test test test test test test test test test test junk";
const chaveDaConta = (i) =>
  ethers.HDNodeWallet.fromPhrase(FRASE, undefined, `m/44'/60'/0'/0/${i}`).privateKey;

const DIA = 86_400;

function artefato(nome) {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        CONTRATOS,
        "../testes/gerados/contratos/artifacts",
        "contratos",
        "contracts",
        `${nome}.sol`,
        `${nome}.json`,
      ),
      "utf8",
    ),
  );
}

async function esperarNo(provedor) {
  for (let i = 0; i < 60; i += 1) {
    try {
      await provedor.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`O hardhat node nao respondeu em ${RPC}.`);
}

test.describe("oraculo contra um no real", { timeout: 240_000 }, () => {
  let no;
  let provedor;
  let fabrica;
  let registry;
  let ambiente;
  let apoliceClimatica;

  /** Roda um comando do oraculo como o operador rodaria. */
  function oraculo(...argumentos) {
    const r = spawnSync(
      process.execPath,
      [
        ["ciclo", "publicar"].includes(argumentos[0])
          ? path.join(__dirname, "..", "ferramentas", "cli-simulacao.cjs")
          : path.join(ORACULO, "src", "index.js"),
        ...argumentos,
      ],
      {
        env: ambiente,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
  }

  async function emitir(sobrescritos = {}) {
    const [seguradora, produtor] = await Promise.all([0, 1].map((i) => provedor.getSigner(i)));
    const agora = (await provedor.getBlock("latest")).timestamp;
    const termos = {
      produtor: await produtor.getAddress(),
      registry: ethers.ZeroAddress,
      cultura: ethers.encodeBytes32String("soja"),
      talhao: ethers.encodeBytes32String("talhao-01"),
      modoPagamento: 0,
      limiarClimatico: 30,
      limiarClimaticoIntegral: 0,
      vigenciaInicio: agora,
      vigenciaFim: agora + 180 * DIA,
      valorIndenizacao: ethers.parseEther("1"),
      hashTermos: ethers.keccak256(ethers.toUtf8Bytes(`termos-${Math.random()}`)),
      ...sobrescritos,
    };

    await (await fabrica.connect(seguradora).emitirApolice(termos)).wait();
    const endereco = await fabrica.apolices((await fabrica.totalApolices()) - 1n);
    const apolice = new ethers.Contract(endereco, artefato("ApolicePolicy").abi, seguradora);
    await (await apolice.depositarGarantia({ value: termos.valorIndenizacao })).wait();

    return endereco;
  }

  test.before(async () => {
    const compilacao = spawnSync(
      process.execPath,
      [
        require.resolve("hardhat/internal/cli/bootstrap"),
        "--config",
        "../testes/contratos/hardhat.config.cjs",
        "compile",
      ],
      { cwd: CONTRATOS, encoding: "utf8", windowsHide: true },
    );
    assert.equal(compilacao.status, 0, compilacao.stdout + compilacao.stderr);

    no = spawn("npx", ["hardhat", "node", "--port", String(PORTA)], {
      cwd: CONTRATOS,
      shell: true,
      stdio: "ignore",
    });

    provedor = new ethers.JsonRpcProvider(RPC, 31337, { staticNetwork: true });
    await esperarNo(provedor);

    const seguradora = await provedor.getSigner(0);
    const enderecoOraculo = new ethers.Wallet(chaveDaConta(2)).address;
    const blocoInicial = await provedor.getBlockNumber();

    const fabricaDe = (nome) => {
      const a = artefato(nome);
      return new ethers.ContractFactory(a.abi, a.bytecode, seguradora);
    };

    registry = await fabricaDe("OracleRegistry").deploy(await seguradora.getAddress());
    await registry.waitForDeployment();
    await (await registry.autorizar(enderecoOraculo)).wait();

    fabrica = await fabricaDe("ApoliceFactory").deploy(
      await registry.getAddress(),
      await seguradora.getAddress(),
    );
    await fabrica.waitForDeployment();

    const temporario = criarTemporario("agrosmart-oraculo-");
    fs.writeFileSync(
      path.join(temporario, "integracao.json"),
      JSON.stringify({
        rede: "integracao",
        chainId: 31337,
        blocoInicial,
        contratos: {
          OracleRegistry: await registry.getAddress(),
          ApoliceFactory: await fabrica.getAddress(),
        },
      }),
    );
    const envVazio = path.join(temporario, "vazio.env");
    fs.writeFileSync(envVazio, "");

    // Ambiente isolado: nada do .env local entra, nem o backend.
    ambiente = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE ?? "",
      ARQUIVO_ENV: envVazio,
      REDE: "integracao",
      RPC_URL: RPC,
      CHAVE_PRIVADA_ORACULO: chaveDaConta(2),
      DIR_IMPLANTACOES: temporario,
      DIR_DADOS: path.join(temporario, "dados"),
      ESPERA_BASE_MS: "50",
    };
    if (!ambiente.NODE_V8_COVERAGE) delete ambiente.NODE_V8_COVERAGE;

    apoliceClimatica = await emitir();
  });

  test.after(() => {
    provedor?.destroy();
    if (process.platform === "win32" && no?.pid) {
      spawnSync("taskkill", ["/PID", String(no.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      no?.kill();
    }
  });

  test("status: endereco, saldo e autorizacao no registro", () => {
    const { codigo, saida } = oraculo("status");
    assert.equal(codigo, 0, saida);
    assert.match(saida, /Autorizado a publicar: sim/);
    assert.match(saida, /Rede\.+: integracao/);
  });

  test("publicar um periodo de safra normal nao aciona", () => {
    const { codigo, saida } = oraculo(
      "publicar",
      "--apolice",
      apoliceClimatica,
      "--periodo",
      "20261001",
      "--cenario",
      "safra_normal",
    );
    assert.equal(codigo, 0, saida);
    assert.match(saida, /20261001/);
    assert.doesNotMatch(saida, /SIM/);
  });

  test("publicar o mesmo periodo de novo e recusado pelo contrato (RF20)", () => {
    const { saida } = oraculo(
      "publicar",
      "--apolice",
      apoliceClimatica,
      "--periodo",
      "20261001",
      "--cenario",
      "safra_normal",
    );
    // A fila ja sabe que o periodo foi concluido; nem chega a gastar uma chamada.
    assert.match(saida, /ja publicado antes \(0x[0-9a-f]{64}\)/);
  });

  test("ciclo de estiagem severa, com leituras defeituosas, aciona e paga", () => {
    const { codigo, saida } = oraculo(
      "ciclo",
      "--apolice",
      apoliceClimatica,
      "--cenario",
      "estiagem_severa",
      "--periodo",
      "20261020",
      "--periodos",
      "8",
      "--com-falhas",
    );
    assert.equal(codigo, 0, saida);
    assert.match(saida, /SIM/);
  });

  test("fila e estatisticas mostram o que foi publicado", () => {
    const fila = oraculo("fila");
    assert.equal(fila.codigo, 0, fila.saida);
    assert.match(fila.saida, /concluida/);

    const reaberta = oraculo("fila", "--reabrir", "chave-que-nao-existe");
    assert.match(reaberta.saida, /nao encontrada/);

    const estatisticas = oraculo("estatisticas");
    assert.equal(estatisticas.codigo, 0, estatisticas.saida);
    assert.match(estatisticas.saida, /"acionamentos": 1/);
  });

  test("publicador historico transmite, confirma e recupera o mesmo recibo sem novo pagamento", async () => {
    const { Publicador } = require("../../../oraculo/src/publicador");
    const seguradora = await provedor.getSigner(0),
      produtor = await provedor.getSigner(1);
    const termos = {
      produtor: await produtor.getAddress(),
      registry: await registry.getAddress(),
      cultura: ethers.encodeBytes32String("soja"),
      talhao: ethers.encodeBytes32String("talhao-01"),
      modoPagamento: 0,
      limiarClimatico: 2,
      limiarClimaticoIntegral: 0,
      vigenciaInicio: 1707264000,
      vigenciaFim: 1707523199,
      valorIndenizacao: ethers.parseEther("0.01"),
      hashTermos: ethers.id("fixture historica sintetica"),
    };
    await (await fabrica.connect(seguradora).emitirApoliceHistorica(termos)).wait();
    const endereco = await fabrica.apolices((await fabrica.totalApolices()) - 1n);
    const apolice = new ethers.Contract(endereco, artefato("ApoliceHistorica").abi, seguradora);
    await (await apolice.depositarGarantia({ value: termos.valorIndenizacao })).wait();
    const p = new Publicador({ rpcUrl: RPC, chavePrivada: chaveDaConta(2), chainId: 31337 });
    try {
      assert.equal(Number((await p.termosHistoricos(endereco)).limiarClimatico), 2);
      let transmitida;
      const antes = await provedor.getBalance(termos.produtor);
      const recibo = await p.publicar({
        apolice: endereco,
        periodo: 20240208,
        indiceClimatico: 2,
        aoTransmitir: async (tx) => {
          transmitida = tx;
        },
      });
      assert.equal(recibo.txHash, transmitida.txHash);
      assert.equal(recibo.acionouPagamento, true);
      const recuperado = await p.recuperar(transmitida, endereco);
      assert.equal(recuperado.txHash, recibo.txHash);
      assert.equal(recuperado.acionouPagamento, true);
      assert.equal(
        await provedor.getBalance(termos.produtor, recibo.bloco),
        antes + termos.valorIndenizacao,
      );
      assert.equal(await apolice.totalPeriodos(), 1n);
    } finally {
      p.encerrar();
    }
  });

  test("comando desconhecido mostra a ajuda e sai com erro", () => {
    const { codigo, saida } = oraculo("comando-que-nao-existe");
    assert.equal(codigo, 1);
    assert.match(saida, /Uso: node src\/index\.js/);
  });

  test("publicador: vigencia e escuta de eventos", async () => {
    const { Publicador } = require("../../../oraculo/src/publicador.js");
    const publicador = new Publicador({
      rpcUrl: RPC,
      chavePrivada: chaveDaConta(2),
      chainId: 31337,
    });

    try {
      assert.equal(await publicador.estaAutorizado(await registry.getAddress()), true);
      assert.ok((await publicador.saldo()) > 0n);

      const agora = (await provedor.getBlock("latest")).timestamp;
      const futura = await emitir({
        vigenciaInicio: agora + 10 * DIA,
        vigenciaFim: agora + 190 * DIA,
      });
      assert.equal(await publicador.dentroDaVigencia(futura), false);
      assert.equal(await publicador.dentroDaVigencia(apoliceClimatica), true);

      const apolice = await emitir();
      const recebidos = [];
      const pararDeOuvir = await publicador.ouvir(apolice, (e) => recebidos.push(e));

      const recibo = await publicador.publicar({
        apolice,
        periodo: 20261101,
        indiceClimatico: 35, // acima do limiarClimatico padrao (30), aciona o pagamento
      });
      assert.equal(recibo.acionouPagamento, true);
      assert.equal(await publicador.periodoJaPublicado(apolice, 20261101), true);
      assert.equal(await publicador.situacaoDaApolice(apolice), "LIQUIDADA");

      // A escuta e por sondagem; da tempo de os eventos chegarem.
      for (let i = 0; i < 40 && recebidos.length === 0; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
      pararDeOuvir();
      assert.ok(recebidos.length > 0, "a escuta deveria ter recebido os eventos da apolice");
    } finally {
      publicador.encerrar();
    }
  });
});
