/**
 * Integracao do indexador com EVM local isolada.
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
 * Roda com `npm run testar:integracao`. Integra a suite completa e
 * depende dos artefatos compilados em `blockchain/` e leva alguns segundos a mais.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

import { ethers } from "ethers";
import { createRequire } from "node:module";
const carregarHardhat = createRequire(new URL("../../../blockchain/package.json", import.meta.url));
const cliHardhat = carregarHardhat.resolve("hardhat/internal/cli/cli.js");

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
process.env.CHAVE_DE_SERVICO = "chave-integracao-api-oraculo";

function artefato(nome) {
  const caminho = join(
    CONTRATOS,
    "../testes/gerados/blockchain/artifacts",
    "blockchain",
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
    const compilacao = spawnSync(
      process.execPath,
      [cliHardhat, "--config", "../testes/blockchain/hardhat.config.cjs", "compile"],
      { cwd: CONTRATOS, encoding: "utf8", windowsHide: true },
    );
    assert.equal(compilacao.status, 0, compilacao.stdout + compilacao.stderr);
    no = spawn(
      process.execPath,
      [
        cliHardhat,
        "--config",
        "../testes/blockchain/hardhat.config.cjs",
        "node",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(PORTA),
      ],
      {
        cwd: CONTRATOS,
        windowsHide: true,
        stdio: "ignore",
      },
    );

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
    const { criarIndexador } = await import("../../../api/src/cadeia/indexador.js");

    banco = await abrirBancoDeTeste();
    await inicializarBanco(banco);
    await semear(banco);
    indexador = criarIndexador(banco, { confirmacoes: 0 });
  });

  after(async () => {
    indexador?.parar();
    const { encerrarProvedor } = await import("../../../api/src/cadeia/rede.js");
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
      limiarClimatico: 30,
      vigenciaInicio: 1577836800,
      vigenciaFim: 1735689599,
      valorIndenizacao: ethers.parseEther("1"),
      hashTermos: ethers.keccak256(ethers.toUtf8Bytes("emitida-por-script")),
    };

    await (await fabrica.connect(seguradora).emitirApoliceHistorica(termos)).wait();
    apolice = (await apolicesEmitidas(fabrica))[Number(0)].toLowerCase();

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
    const a = artefato("ApoliceHistorica");
    const contrato = new ethers.Contract(apolice, a.abi, provedor);

    await (
      await contrato.connect(seguradora).depositarGarantia({ value: ethers.parseEther("1") })
    ).wait();

    for (const [periodo, indice] of [
      [20241210, 28],
      [20241211, 29],
      [20241212, 30],
    ]) {
      const recibo = await (
        await contrato.connect(oraculo).publicarIndices(periodo, indice)
      ).wait();
      const txHash = periodo === 20241211 ? ethers.id("relato falso sintetico") : recibo.hash;
      const valor = periodo === 20241212 ? indice + 1 : indice;
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
    assert.equal(estado[0].periodo_acionador, 20241212);

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
      limiarClimatico: 30,
      vigenciaInicio: 1577836800,
      vigenciaFim: 1735689599,
      valorIndenizacao: ethers.parseEther("1"),
      hashTermos: ethers.keccak256(ethers.toUtf8Bytes(`emitida-${Math.random()}`)),
      ...sobrescritos,
    };

    await (await fabrica.connect(seguradora).emitirApoliceHistorica(termos)).wait();
    const endereco = (await apolicesEmitidas(fabrica))[
      Number(BigInt((await apolicesEmitidas(fabrica)).length) - 1n)
    ];
    const contrato = new ethers.Contract(endereco, artefato("ApoliceHistorica").abi, provedor);
    await (
      await contrato.connect(seguradora).depositarGarantia({ value: termos.valorIndenizacao })
    ).wait();

    return contrato;
  }

  test("cancelamento antes da vigencia: situacao CANCELADA e partes avisadas", async () => {
    const [, produtor] = contas;
    const agora = (await provedor.getBlock("latest")).timestamp;
    const contrato = await emitir({
      vigenciaInicio: 1577836800,
      vigenciaFim: 1735689599,
    });

    await (await contrato.connect(produtor).cancelar()).wait();
    await indexador.varrer();

    const endereco = (await contrato.getAddress()).toLowerCase();
    const { rows } = await banco.query("SELECT situacao FROM apolices WHERE endereco = $1", [
      endereco,
    ]);
    assert.equal(rows[0].situacao, 4);

    const { rows: avisos } = await banco.query(
      "SELECT count(*)::int AS n FROM notificacoes WHERE tipo = 'apolice_cancelada' AND apolice_endereco = $1",
      [endereco],
    );
    assert.equal(avisos[0].n, 2, "produtor e seguradora deveriam ser avisados");
  });

  test("com o no fora do ar, a varredura falha sem derrubar nada e retoma depois", async () => {
    const { encerrarProvedor } = await import("../../../api/src/cadeia/rede.js");
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
  test("indexador rejeita gatilho adulterado com hash certo e aceita a emissao seguinte", async () => {
    const { descreverTermos, resumirTermos } = await import("../../../api/src/dominio/termos.js");
    const { randomUUID } = await import("node:crypto");
    const propostaId = randomUUID();
    const produtor = (await contas[1].getAddress()).toLowerCase();
    const usuario = (await banco.query("SELECT id FROM usuarios WHERE identificador='produtor'"))
      .rows[0];
    const talhao = (await banco.query("SELECT id FROM talhoes WHERE identificador='talhao-01'"))
      .rows[0];
    const produto = (await banco.query("SELECT id FROM produtos WHERE cultura='soja' LIMIT 1"))
      .rows[0];
    const termos = {
      propostaId,
      carteiraProdutor: produtor,
      talhao: "talhao-01",
      cultura: "soja",
      modoHistorico: true,
      estacao: "A770",
      hashSerie: "0".repeat(64),
      inicioHistorico: "2024-02-07",
      fimHistorico: "2024-02-09",
      limiarClimatico: 2,
      vigenciaInicio: 1707264000,
      vigenciaFim: 1707523199,
      valorIndenizacaoWei: ethers.parseEther("0.01").toString(),
    };
    const descricao = descreverTermos(termos);
    const hash = resumirTermos(descricao);
    await banco.query(
      `INSERT INTO propostas
      (id,produtor_id,talhao_id,produto_id,carteira_produtor,valor_indenizacao_wei,termos,hash_termos,descricao_dos_termos,situacao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'preparada')`,
      [
        propostaId,
        usuario.id,
        talhao.id,
        produto.id,
        produtor,
        termos.valorIndenizacaoWei,
        JSON.stringify(termos),
        hash,
        descricao,
      ],
    );
    const base = {
      produtor,
      registry: ethers.ZeroAddress,
      talhao: ethers.encodeBytes32String("talhao-01"),
      cultura: ethers.encodeBytes32String("soja"),
      vigenciaInicio: termos.vigenciaInicio,
      vigenciaFim: termos.vigenciaFim,
      valorIndenizacao: termos.valorIndenizacaoWei,
      hashTermos: hash,
    };
    const anterior = BigInt((await apolicesEmitidas(fabrica)).length);
    await (
      await fabrica.connect(contas[0]).emitirApoliceHistorica({ ...base, limiarClimatico: 3 })
    ).wait();
    const errado = (await apolicesEmitidas(fabrica))[Number(anterior)].toLowerCase();
    await (
      await fabrica.connect(contas[0]).emitirApoliceHistorica({ ...base, limiarClimatico: 2 })
    ).wait();
    const certo = (await apolicesEmitidas(fabrica))[Number(anterior + 1n)].toLowerCase();
    const resultado = await indexador.varrer();
    assert.equal(resultado.erro, undefined, resultado.erro);
    assert.equal(
      (await banco.query("SELECT id FROM apolices WHERE endereco=$1", [errado])).rows.length,
      0,
    );
    assert.equal(
      (await banco.query("SELECT proposta_id FROM apolices WHERE endereco=$1", [certo])).rows[0]
        .proposta_id,
      propostaId,
    );
    assert.equal(
      (await banco.query("SELECT situacao FROM propostas WHERE id=$1", [propostaId])).rows[0]
        .situacao,
      "emitida",
    );
    await banco.query("UPDATE estado_indexador SET ultimo_bloco=0");
    assert.equal((await indexador.varrer()).erro, undefined);
    assert.equal(
      (await banco.query("SELECT id FROM apolices WHERE endereco=$1", [errado])).rows.length,
      0,
    );
  });

  test("ciclo completo da API com o oráculo atual: gatilho, pagamento e fim sem acionamento", async () => {
    const { criarApp } = await import("../../../api/src/app.js");
    const { criarLeitorDaCadeia } = await import("../../../api/src/cadeia/leitor.js");
    const { importarInmet } = await import("../../../api/src/banco/importarInmet.js");
    const { avaliarHistorico } = carregarHardhat("../oraculo/src/historico.js");
    const { ClienteBackend } = carregarHardhat("../oraculo/src/clienteBackend.js");
    const { ServicoOraculo } = carregarHardhat("../oraculo/src/oraculo.js");
    const { FilaDePublicacoes } = carregarHardhat("../oraculo/src/fila.js");
    const { Publicador } = carregarHardhat("../oraculo/src/publicador.js");
    const { executarCiclo } = carregarHardhat("../oraculo/src/ciclo.js");
    await importarInmet(banco);
    const app = criarApp({ banco, cadeia: criarLeitorDaCadeia(), indexador });
    const servidor = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const url = `http://127.0.0.1:${servidor.address().port}/api`;
    const pedir = async (caminho, { token, corpo, metodo = "GET" } = {}) => {
      const r = await fetch(url + caminho, {
        method: metodo,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(corpo ? { "Content-Type": "application/json" } : {}),
        },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      });
      const dados = r.status === 204 ? null : await r.json();
      assert.ok(r.ok, JSON.stringify(dados));
      return dados;
    };
    // Chave padrao publica do Hardhat, derivada somente neste teste isolado.
    const chave = ethers.HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
      undefined,
      "m/44'/60'/0'/0/2",
    ).privateKey;
    const publicador = new Publicador({ rpcUrl: RPC, chavePrivada: chave, chainId: 31337 });
    publicador.provider.pollingInterval = 10;
    const backend = new ClienteBackend({ url, chave: process.env.CHAVE_DE_SERVICO });
    const fila = new FilaDePublicacoes(join(dirImplantacoes, "fila-completa.json"), {
      maxTentativas: 2,
    });
    const servico = new ServicoOraculo({ publicador, backend, fila, opcoes: { esperaBaseMs: 0 } });
    try {
      const produtor = (
        await pedir("/autenticacao/entrar", {
          metodo: "POST",
          corpo: { identificador: "produtor", senha: "agrosmart" },
        })
      ).token;
      const seguradora = (
        await pedir("/autenticacao/entrar", {
          metodo: "POST",
          corpo: { identificador: "seguradora", senha: "agrosmart" },
        })
      ).token;
      const talhoes = (await pedir("/talhoes", { token: produtor })).talhoes;
      const produto = (await pedir("/produtos", { token: produtor })).produtos[0];
      const janela = (
        await banco.query(`SELECT a.data::text inicio, (a.data+2)::text fim FROM inmet_dias a
        JOIN inmet_dias b ON b.estacao=a.estacao AND b.data=a.data+1
        JOIN inmet_dias c ON c.estacao=a.estacao AND c.data=a.data+2
        WHERE a.estacao='A770' AND a.data BETWEEN '2024-01-01' AND '2024-12-29'
          AND a.horas_validas>=20 AND b.horas_validas>=20 AND c.horas_validas>=20
          AND a.chuva_mm<1 AND b.chuva_mm<1 AND c.chuva_mm IS NOT NULL ORDER BY a.data LIMIT 1`)
      ).rows[0];
      assert.ok(janela, "O pacote real precisa conter a janela de teste.");
      for (const [gatilho, esperado] of [
        [2, true],
        [366, false],
      ]) {
        const proposta = (
          await pedir("/propostas", {
            metodo: "POST",
            token: produtor,
            corpo: {
              talhaoId: talhoes[0].id,
              produtoId: produto.id,
              inicioDaVigencia: janela.inicio,
              fimDaVigencia: janela.fim,
              gatilhoDias: gatilho,
            },
          })
        ).proposta;
        const preparo = await pedir(`/propostas/${proposta.id}/preparar`, {
          metodo: "POST",
          token: seguradora,
        });
        const total = BigInt((await apolicesEmitidas(fabrica)).length);
        const emissao = await (
          await fabrica.connect(contas[0]).emitirApoliceHistorica(preparo.termos)
        ).wait();
        const endereco = (await apolicesEmitidas(fabrica))[Number(total)].toLowerCase();
        await pedir(`/propostas/${proposta.id}/emissao`, {
          metodo: "POST",
          token: seguradora,
          corpo: { txHash: emissao.hash },
        });
        const contrato = new ethers.Contract(endereco, artefato("ApoliceHistorica").abi, contas[0]);
        await (await contrato.depositarGarantia({ value: preparo.termos.valorIndenizacao })).wait();
        assert.equal((await indexador.varrer()).erro, undefined);
        const serie = await backend.serieHistorica(endereco);
        const referencia = avaliarHistorico({
          linhas: serie.linhas,
          inicio: janela.inicio,
          fim: janela.fim,
          gatilho,
        });
        assert.equal(Boolean(referencia.primeiroAcionamento), esperado);
        if (esperado) await pedir("/carteira", { metodo: "DELETE", token: produtor });
        const saldoAntes = await provedor.send("eth_getBalance", [
          await contas[1].getAddress(),
          "latest",
        ]);
        const resultado = await executarCiclo(servico, () => {});
        assert.equal(
          resultado.publicadas,
          1,
          JSON.stringify(resultado, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
        );
        const saldoDepois = await provedor.send("eth_getBalance", [
          await contas[1].getAddress(),
          "latest",
        ]);
        assert.equal(
          BigInt(saldoDepois) - BigInt(saldoAntes),
          esperado ? BigInt(preparo.termos.valorIndenizacao) : 0n,
        );
        const entradas = fila.entradas.length;
        assert.equal((await executarCiclo(servico, () => {})).publicadas, 0);
        assert.equal(fila.entradas.length, entradas);
        assert.equal((await indexador.varrer()).erro, undefined);
        const registro = (
          await banco.query("SELECT * FROM publicacoes_oraculo WHERE apolice_endereco=$1", [
            endereco,
          ])
        ).rows;
        assert.equal(registro.length, 1);
        assert.equal(registro[0].confirmada_na_cadeia, true);
        if (esperado) {
          const lista = await pedir("/apolices", { token: produtor });
          assert.ok(lista.apolices.some((a) => a.endereco === endereco));
          const avisos = await pedir("/notificacoes", { token: produtor });
          assert.ok(
            avisos.notificacoes.some(
              (n) => n.apolice_endereco === endereco && n.tipo === "indenizacao_paga",
            ),
          );
          await banco.query("UPDATE usuarios SET carteira=$1 WHERE identificador='produtor'", [
            (await contas[1].getAddress()).toLowerCase(),
          ]);
        }
        assert.equal(registro[0].procedencia.hashSerie, serie.termos.hashSerie);
        if (!esperado) {
          await (await contrato.resgatarGarantia()).wait();
          assert.equal((await indexador.varrer()).erro, undefined);
          assert.equal(Number(await contrato.situacao()), 3);
        }
      }
    } finally {
      servico.encerrar();
      servidor.closeAllConnections();
      await new Promise((resolve) => servidor.close(resolve));
    }
  });

  test("troca de fabrica continua descobrindo emissoes da fabrica anterior", async () => {
    const [seguradora, produtor] = contas;
    const m = JSON.parse(readFileSync(join(dirImplantacoes, "integracao.json")));
    const art = artefato("ApoliceFactory");
    const nova = await new ethers.ContractFactory(art.abi, art.bytecode, seguradora).deploy(
      m.contratos.OracleRegistry,
      await seguradora.getAddress(),
    );
    await nova.waitForDeployment();
    writeFileSync(
      join(dirImplantacoes, "integracao.json"),
      JSON.stringify({
        ...m,
        blocoImplantacaoFabrica: (await nova.deploymentTransaction().wait()).blockNumber,
        contratos: { ...m.contratos, ApoliceFactory: await nova.getAddress() },
        fabricasAnteriores: [
          { endereco: await fabrica.getAddress(), blocoInicial: m.blocoInicial },
        ],
      }),
    );
    const termos = {
      produtor: await produtor.getAddress(),
      registry: ethers.ZeroAddress,
      cultura: ethers.encodeBytes32String("soja"),
      talhao: ethers.encodeBytes32String("talhao-01"),
      limiarClimatico: 30,
      vigenciaInicio: 1577836800,
      vigenciaFim: 1735689599,
      valorIndenizacao: ethers.parseEther("1"),
      hashTermos: ethers.id("fabrica-anterior-ainda-acompanhada"),
    };
    await (await fabrica.connect(seguradora).emitirApoliceHistorica(termos)).wait();
    const emitidas = await apolicesEmitidas(fabrica);
    const endereco = emitidas.at(-1).toLowerCase();
    const { provedor: rpcDoIndexador } = await import("../../../api/src/cadeia/rede.js");
    const rpc = rpcDoIndexador();
    const getLogs = rpc.getLogs.bind(rpc);
    const enderecoNova = (await nova.getAddress()).toLowerCase();
    const blocoNova = (await nova.deploymentTransaction().wait()).blockNumber;
    rpc.getLogs = async (filtro) => {
      const enderecos = [filtro.address].flat().map((a) => a.toLowerCase());
      if (enderecos.includes(enderecoNova))
        assert.ok(filtro.fromBlock >= blocoNova, "não consultar fábrica antes da implantação");
      return getLogs(filtro);
    };
    let r;
    try {
      r = await indexador.varrer();
    } finally {
      rpc.getLogs = getLogs;
    }
    assert.equal(r.erro, undefined, r.erro);
    assert.equal(
      (await banco.query("SELECT endereco FROM apolices WHERE endereco=$1", [endereco])).rows
        .length,
      1,
    );
    const logs = await banco.query(
      "SELECT contrato FROM eventos_cadeia WHERE nome='ApoliceEmitida' AND argumentos->>'apolice' ILIKE $1",
      [endereco],
    );
    assert.equal(logs.rows[0].contrato, (await fabrica.getAddress()).toLowerCase());
  });
});

/** Apolices emitidas pela fabrica, na ordem, lidas do evento ApoliceEmitida. */
async function apolicesEmitidas(fabrica) {
  // Bloco atual pedido ao no, sem o cache de numero de bloco do provedor.
  const provedor = fabrica.runner.provider ?? fabrica.runner;
  const ate = Number(await provedor.send("eth_blockNumber", []));
  const eventos = await fabrica.queryFilter(fabrica.filters.ApoliceEmitida(), 0, ate);
  return eventos.map((e) => e.args.apolice);
}
