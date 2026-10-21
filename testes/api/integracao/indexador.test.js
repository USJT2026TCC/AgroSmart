/**
 * Teste de integracao do indexador contra uma blockchain de verdade.
 *
 * Os testes unitarios usam um leitor de cadeia falso. O indexador, porem, conversa
 * com a rede de fato — le logs, decodifica eventos, relê o estado dos contratos —,
 * e um falso so testaria o falso. Aqui o teste:
 *
 *   1. sobe um `hardhat node` proprio, em uma porta separada;
 *   2. implanta os contratos a partir dos artefatos de compilacao;
 *   3. emite uma apolice, deposita a garantia e publica indices ate o pagamento;
 *   4. roda o indexador e confere o que ele gravou no banco.
 *
 * Roda com `npm run testar:integracao`. Fica fora da suite principal porque
 * depende dos artefatos compilados em `blockchain/` e leva alguns segundos a mais.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

import { ethers } from "ethers";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATOS = join(AQUI, "..", "..", "..", "blockchain");
const PORTA = 8599;
const RPC = `http://127.0.0.1:${PORTA}`;

// A configuracao e lida na importacao, entao as variaveis vem antes de tudo.
const dirImplantacoes = mkdtempSync(join(tmpdir(), "agrosmart-implantacao-"));
process.env.NODE_ENV = "teste";
process.env.RPC_URL = RPC;
process.env.REDE = "integracao";
process.env.DIR_IMPLANTACOES = dirImplantacoes;
process.env.INDEXADOR = "desligado";

function artefato(nome) {
  const caminho = join(
    CONTRATOS,
    "artifacts",
    "contracts",
    `${nome}.sol`,
    `${nome}.json`,
  );
  return JSON.parse(readFileSync(caminho, "utf8"));
}

async function esperarNo(provedor, tentativas = 60) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      await provedor.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`O hardhat node nao respondeu em ${RPC}.`);
}

describe("indexador contra um no real", { timeout: 180_000 }, () => {
  let no;
  let provedor;
  let banco;
  let indexador;
  let contas;
  let apolice;
  let fabrica;

  before(async () => {
    if (!existsSync(join(CONTRATOS, "artifacts", "contracts"))) {
      const compilacao = spawnSync("npx", ["hardhat", "compile"], {
        cwd: CONTRATOS,
        shell: true,
        stdio: "inherit",
      });
      assert.equal(compilacao.status, 0, "falha ao compilar os contratos");
    }

    no = spawn("npx", ["hardhat", "node", "--port", String(PORTA)], {
      cwd: CONTRATOS,
      shell: true,
      stdio: "ignore",
    });

    provedor = new ethers.JsonRpcProvider(RPC, 31337, { staticNetwork: true });
    await esperarNo(provedor);

    // Contas do no: 0 seguradora, 1 produtor, 2 oraculo.
    contas = await Promise.all([0, 1, 2].map((i) => provedor.getSigner(i)));
    const [seguradora, , oraculo] = contas;

    const blocoInicial = await provedor.getBlockNumber();

    const fabricaDe = (nome, assinante) => {
      const a = artefato(nome);
      return new ethers.ContractFactory(a.abi, a.bytecode, assinante);
    };

    const registry = await fabricaDe("OracleRegistry", seguradora).deploy(
      await seguradora.getAddress(),
    );
    await registry.waitForDeployment();
    await (await registry.autorizar(await oraculo.getAddress())).wait();

    fabrica = await fabricaDe("ApoliceFactory", seguradora).deploy(
      await registry.getAddress(),
      await seguradora.getAddress(),
    );
    await fabrica.waitForDeployment();

    writeFileSync(
      join(dirImplantacoes, "integracao.json"),
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

    const { abrirBancoDeTeste } = await import("../fixtures/banco.js");
    const { inicializarBanco } = await import("../../../api/src/banco/inicializar.js");
    const { semearParaTeste: semear } = await import("../fixtures/semente.js");
    const { criarIndexador } =
      await import("../../../api/src/cadeia/indexador.js");

    banco = await abrirBancoDeTeste();
    await inicializarBanco(banco);
    await semear(banco);
    indexador = criarIndexador(banco, { confirmacoes: 0 });
  });

  after(async () => {
    indexador?.parar();
    const { encerrarProvedor } =
      await import("../../../api/src/cadeia/rede.js");
    encerrarProvedor();
    provedor?.destroy();
    await banco?.fechar();

    // No Windows, matar o `npx` nao derruba o node filho; `taskkill /T` derruba a arvore.
    if (process.platform === "win32" && no?.pid) {
      spawnSync("taskkill", ["/PID", String(no.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      no?.kill();
    }
  });

  test("apolice emitida por fora do aplicativo e descoberta e ligada ao talhao", async () => {
    const [seguradora, produtor] = contas;
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
      vigenciaFim: agora + 180 * 86_400,
      valorIndenizacao: ethers.parseEther("1"),
      hashTermos: ethers.keccak256(ethers.toUtf8Bytes("emitida-por-script")),
    };

    await (await fabrica.connect(seguradora).emitirApolice(termos)).wait();
    apolice = (await fabrica.apolices(0)).toLowerCase();

    const varredura = await indexador.varrer();
    assert.equal(varredura.erro, undefined, varredura.erro);

    const { rows } = await banco.query(
      `SELECT a.situacao, t.identificador FROM apolices a LEFT JOIN talhoes t ON t.id = a.talhao_id
        WHERE a.endereco = $1`,
      [apolice],
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].identificador, "talhao-01");
    assert.equal(rows[0].situacao, 0);
  });

  test("garantia, publicacoes e pagamento: situacao relida do contrato e notificacoes geradas", async () => {
    const [seguradora, , oraculo] = contas;
    const a = artefato("ApolicePolicy");
    const contrato = new ethers.Contract(apolice, a.abi, provedor);

    await (
      await contrato
        .connect(seguradora)
        .depositarGarantia({ value: ethers.parseEther("1") })
    ).wait();

    for (const [periodo, indice] of [
      [20260910, 28],
      [20260911, 29],
      [20260912, 30],
    ]) {
      const recibo = await (
        await contrato.connect(oraculo).publicarIndices(periodo, indice)
      ).wait();
      const txHash =
        periodo === 20260911
          ? ethers.id("relato falso sintetico")
          : recibo.hash;
      const valor = periodo === 20260912 ? indice + 1 : indice;
      await banco.query(
        "INSERT INTO publicacoes_oraculo (apolice_endereco,periodo,tx_hash,indice_climatico) VALUES ($1,$2,$3,$4)",
        [apolice, periodo, txHash, valor],
      );
    }

    await indexador.varrer();

    const relatos = (
      await banco.query(
        "SELECT confirmada_na_cadeia FROM publicacoes_oraculo ORDER BY confirmada_na_cadeia DESC",
      )
    ).rows;
    assert.deepEqual(
      relatos.map((r) => r.confirmada_na_cadeia),
      [true, false, false],
    );

    const { rows: estado } = await banco.query(
      "SELECT situacao, valor_pago_wei, periodo_acionador FROM apolices WHERE endereco = $1",
      [apolice],
    );

    assert.equal(estado[0].situacao, 2);
    assert.equal(estado[0].valor_pago_wei, ethers.parseEther("1").toString());
    assert.equal(estado[0].periodo_acionador, 20260912);

    const { rows: eventos } = await banco.query(
      "SELECT nome, count(*)::int AS n FROM eventos_cadeia WHERE contrato = $1 GROUP BY nome ORDER BY nome",
      [apolice],
    );

    assert.deepEqual(Object.fromEntries(eventos.map((e) => [e.nome, e.n])), {
      CondicaoAvaliada: 3,
      GarantiaDepositada: 1,
      IndicesPublicados: 3,
      PagamentoExecutado: 1,
    });

    // O produtor semeado tem a carteira da conta 1: recebe a notificacao do pagamento.
    const { rows: notificacoes } = await banco.query(
      `SELECT n.tipo FROM notificacoes n JOIN usuarios u ON u.id = n.usuario_id
        WHERE u.identificador = 'produtor' ORDER BY n.id`,
    );

    assert.deepEqual(
      notificacoes.map((n) => n.tipo),
      ["apolice_emitida", "cobertura_ativa", "indenizacao_paga"],
    );
  });

  test("reprocessar os mesmos blocos nao duplica evento nem notificacao", async () => {
    const antes = await banco.query(
      "SELECT (SELECT count(*) FROM eventos_cadeia)::int AS e, (SELECT count(*) FROM notificacoes)::int AS n",
    );

    // Volta o ponteiro do indexador para o inicio e varre de novo.
    await banco.query("UPDATE estado_indexador SET ultimo_bloco = 0");
    await indexador.varrer();

    const depois = await banco.query(
      "SELECT (SELECT count(*) FROM eventos_cadeia)::int AS e, (SELECT count(*) FROM notificacoes)::int AS n",
    );

    assert.deepEqual(depois.rows[0], antes.rows[0]);
  });

  /** Emite pela fabrica e devolve o contrato da apolice nova, ja com a ABI completa. */
  async function emitir(sobrescritos) {
    const [seguradora, produtor] = contas;
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
      vigenciaFim: agora + 180 * 86_400,
      valorIndenizacao: ethers.parseEther("1"),
      hashTermos: ethers.keccak256(
        ethers.toUtf8Bytes(`emitida-${Math.random()}`),
      ),
      ...sobrescritos,
    };

    await (await fabrica.connect(seguradora).emitirApolice(termos)).wait();
    const endereco = await fabrica.apolices(
      (await fabrica.totalApolices()) - 1n,
    );
    const contrato = new ethers.Contract(
      endereco,
      artefato("ApolicePolicy").abi,
      provedor,
    );
    await (
      await contrato
        .connect(seguradora)
        .depositarGarantia({ value: termos.valorIndenizacao })
    ).wait();

    return contrato;
  }

  test("cancelamento antes da vigencia: situacao CANCELADA e partes avisadas (RF10)", async () => {
    const [, produtor] = contas;
    const agora = (await provedor.getBlock("latest")).timestamp;
    const contrato = await emitir({
      vigenciaInicio: agora + 10 * 86_400,
      vigenciaFim: agora + 190 * 86_400,
    });

    await (await contrato.connect(produtor).cancelar()).wait();
    await indexador.varrer();

    const endereco = (await contrato.getAddress()).toLowerCase();
    const { rows } = await banco.query(
      "SELECT situacao FROM apolices WHERE endereco = $1",
      [endereco],
    );
    assert.equal(rows[0].situacao, 4);

    const { rows: avisos } = await banco.query(
      "SELECT count(*)::int AS n FROM notificacoes WHERE tipo = 'apolice_cancelada' AND apolice_endereco = $1",
      [endereco],
    );
    assert.equal(avisos[0].n, 2, "produtor e seguradora deveriam ser avisados");
  });

  test("com o no fora do ar, a varredura falha sem derrubar nada e retoma depois", async () => {
    const { encerrarProvedor } =
      await import("../../../api/src/cadeia/rede.js");
    const original = process.env.RPC_URL;

    // Aponta para uma porta sem ninguem escutando.
    const { config } = await import("../../../api/src/config.js");
    config.rpcUrl = "http://127.0.0.1:9";
    encerrarProvedor();

    const falha = await indexador.varrer();
    assert.ok(falha.erro, "a varredura deveria relatar o erro");

    config.rpcUrl = original;
    encerrarProvedor();

    const retomada = await indexador.varrer();
    assert.equal(retomada.erro, undefined);
  });
});
