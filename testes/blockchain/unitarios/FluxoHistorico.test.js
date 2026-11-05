const { ethers } = require("hardhat");
const { expect, montarTermos } = require("../fixtures/ajuda.js");
const { ServicoOraculo } = require("../../../oraculo/src/oraculo");
const { FilaDePublicacoes } = require("../../../oraculo/src/fila");
const fs = require("node:fs");
const path = require("node:path");

process.env.CHAVE_DE_SERVICO ||= "chave-de-teste";

describe("Fluxo historico: API, banco, oraculo e EVM", function () {
  it("calcula a primeira data pelo banco e liquida integralmente na EVM", async function () {
    const { abrirBancoDeTeste } = await import("../../api/fixtures/banco.js");
    const { inicializarBanco } = await import("../../../api/src/banco/inicializar.js");
    const { hashDaSerie } = await import("../../../api/src/dominio/reproducao.js");
    const { criarApp } = await import("../../../api/src/app.js");
    const { ClienteBackend } = require("../../../oraculo/src/clienteBackend");
    const { config } = await import("../../../api/src/config.js");
    const banco = await abrirBancoDeTeste();
    const tmp = path.resolve(__dirname, "../../gerados/historico-integracao");
    fs.mkdirSync(tmp, { recursive: true });
    const [seguradora, produtor, oraculo] = await ethers.getSigners();
    let servidor;
    try {
      await inicializarBanco(banco);
      const { pacote, compromisso } = require("../../oraculo/fixtures/historico.cjs");
      const dirPacote = path.join(tmp, "pacote");
      const meta = pacote(dirPacote, [
        { data: "2024-02-07", chuva_mm: 0, horas_validas: 24 },
        { data: "2024-02-08", chuva_mm: 0, horas_validas: 24 },
        { data: "2024-02-09", chuva_mm: 10, horas_validas: 24 },
      ]);
      const t = {
        modoHistorico: true,
        estacao: "A770",
        inicioHistorico: "2024-02-07",
        fimHistorico: "2024-02-09",
        limiarClimatico: 2,
        hashSerie: meta.hashSerie,
      };
      const compromissoFixture = compromisso(t);
      await banco.query(
        "INSERT INTO inmet_arquivos(estacao,ano,sha256_original,sha256_diario,procedencia) VALUES ('A770',2024,$1,$2,'{}')",
        [meta.sha256Original, meta.sha256Diario],
      );
      await banco.query(`INSERT INTO inmet_dias(estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas)
        VALUES ('A770','2024-02-07',0,24,0,0),('A770','2024-02-08',0,24,0,0),('A770','2024-02-09',10,24,0,0)`);
      const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
      await registry.autorizar(oraculo.address);
      const fabrica = await ethers.deployContract("ApoliceFactory", [
        await registry.getAddress(),
        seguradora.address,
      ]);
      const termos = await montarTermos({
        produtor: produtor.address,
        registry: await registry.getAddress(),
        vigenciaInicio: 1707264000,
        vigenciaFim: 1707523199,
        limiarClimatico: 2,
        hashTermos: compromissoFixture.hashTermos,
      });
      await fabrica.emitirApoliceHistorica(termos);
      const endereco = (await apolicesEmitidas(fabrica))[Number(0)];
      const apolice = await ethers.getContractAt("ApoliceHistorica", endereco);
      await apolice.depositarGarantia({ value: termos.valorIndenizacao });
      const { semearParaTeste } = await import("../../api/fixtures/semente.js");
      const { registrarApoliceEmitida } = await import("../../../api/src/dominio/apolices.js");
      await semearParaTeste(banco);
      const { rows: produtores } = await banco.query(
        "SELECT id FROM usuarios WHERE identificador='produtor'",
      );
      const { rows: talhoes } = await banco.query(
        "SELECT id FROM talhoes WHERE identificador='talhao-01'",
      );
      const { rows: produtos } = await banco.query(
        "SELECT id FROM produtos WHERE cultura='soja' LIMIT 1",
      );
      await banco.query(
        `INSERT INTO propostas (produtor_id,talhao_id,produto_id,carteira_produtor,valor_indenizacao_wei,termos,hash_termos,descricao_dos_termos,situacao)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'preparada')`,
        [
          produtores[0].id,
          talhoes[0].id,
          produtos[0].id,
          produtor.address.toLowerCase(),
          String(termos.valorIndenizacao),
          JSON.stringify(t),
          termos.hashTermos,
          compromissoFixture.descricaoDosTermos,
        ],
      );
      await registrarApoliceEmitida(banco, {
        endereco: endereco.toLowerCase(),
        produtor: produtor.address.toLowerCase(),
        seguradora: seguradora.address.toLowerCase(),
        hashTermos: termos.hashTermos,
        talhaoBytes32: termos.talhao,
        valorIndenizacaoWei: String(termos.valorIndenizacao),
        txHash: "0x" + "a".repeat(64),
        bloco: 1,
        termosNaCadeia: { ...termos, modoHistorico: true },
      });
      servidor = criarApp({
        banco,
        cadeia: { disponivel: () => false },
      }).listen(0, "127.0.0.1");
      await new Promise((resolve) => servidor.once("listening", resolve));
      const backend = new ClienteBackend({
        url: `http://127.0.0.1:${servidor.address().port}/api`,
        chave: config.chaveDeServico,
      });
      const publicador = {
        termosHistoricos: async () => apolice.verTermos(),
        periodoJaPublicado: async (_endereco, periodo) => apolice.periodoPublicado(periodo),
        publicar: async ({ periodo, indiceClimatico }) => {
          const tx = await apolice.connect(oraculo).publicarIndices(periodo, indiceClimatico);
          const recibo = await tx.wait();
          return {
            txHash: tx.hash,
            gasUsado: recibo.gasUsed,
            enviadoEm: new Date().toISOString(),
            confirmadoEm: new Date().toISOString(),
          };
        },
      };
      const servico = new ServicoOraculo({
        publicador,
        backend,
        fila: new FilaDePublicacoes(path.join(tmp, `fila-${Date.now()}.json`)),
        opcoes: { esperaBaseMs: 1, dirPacote },
      });
      const entrada = await servico.prepararHistorico(endereco);
      expect(entrada.periodo).to.equal(20240208);
      expect(entrada.payload.indiceClimatico).to.equal(2);
      const saldoAntes = await ethers.provider.getBalance(produtor.address);
      const publicado = await servico.publicarEntrada(entrada);
      expect(publicado.sucesso).to.equal(true);
      expect(await ethers.provider.getBalance(produtor.address)).to.equal(
        saldoAntes + termos.valorIndenizacao,
      );
      expect(await apolice.situacao()).to.equal(2);
      expect(await apolice.periodoAcionador()).to.equal(20240208);
      const { rows: relatos } = await banco.query(
        "SELECT tx_hash,indice_climatico,procedencia,confirmada_na_cadeia FROM publicacoes_oraculo WHERE apolice_endereco=$1",
        [endereco.toLowerCase()],
      );
      expect(relatos).to.have.lengthOf(1);
      expect(relatos[0].tx_hash).to.equal(publicado.recibo.txHash);
      expect(relatos[0].indice_climatico).to.equal(2);
      expect(relatos[0].procedencia.estacao).to.equal("A770");
      // O relato real chegou à API; sem indexador neste ensaio, ainda não é confirmado por ela.
      expect(relatos[0].confirmada_na_cadeia).to.equal(false);
      expect(entrada.relatoPendente).to.equal(false);
      await servico.relatarPublicacao(entrada);
      expect(
        Number((await banco.query("SELECT count(*) AS n FROM publicacoes_oraculo")).rows[0].n),
      ).to.equal(1);
    } finally {
      if (servidor) await new Promise((resolve) => servidor.close(resolve));
      await banco.fechar();
    }
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
