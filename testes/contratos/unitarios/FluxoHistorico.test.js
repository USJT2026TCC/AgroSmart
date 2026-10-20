const { ethers } = require("hardhat");
const { expect, montarTermos } = require("./helpers");
const { ServicoOraculo } = require("../../../oraculo/src/oraculo");
const { FilaDePublicacoes } = require("../../../oraculo/src/fila");
const { RegistroDePublicacoes } = require("../../../oraculo/src/registro");
const { RegistroReputacao } = require("../../../oraculo/src/reputacao");
const fs = require("node:fs");
const path = require("node:path");

describe("Fluxo historico: API, banco, oraculo e EVM", function () {
  it("calcula a primeira data pelo banco e liquida integralmente na EVM", async function () {
    const { abrirBanco } =
      await import("../../../backend/src/banco/conexao.js");
    const { migrar } = await import("../../../backend/src/banco/migrar.js");
    const { hashDaSerie } =
      await import("../../../backend/src/dominio/reproducao.js");
    const { criarApp } = await import("../../../backend/src/app.js");
    const { ClienteBackend } = require("../../../oraculo/src/clienteBackend");
    const { config } = await import("../../../backend/src/config.js");
    const banco = await abrirBanco({ emMemoria: true });
    const tmp = path.resolve(__dirname, "../../gerados/historico-integracao");
    fs.mkdirSync(tmp, { recursive: true });
    const [seguradora, produtor, oraculo] = await ethers.getSigners();
    let servidor;
    try {
      await migrar(banco);
      await banco.query(
        `INSERT INTO inmet_arquivos(estacao,ano,sha256_original,sha256_diario,procedencia) VALUES ('A770',2024,'fixture-original','fixture-diario','{}')`,
      );
      await banco.query(`INSERT INTO inmet_dias(estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas)
        VALUES ('A770','2024-02-07',0,24,0,0),('A770','2024-02-08',0,24,0,0),('A770','2024-02-09',10,24,0,0)`);
      const registry = await ethers.deployContract("OracleRegistry", [
        seguradora.address,
      ]);
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
      });
      await fabrica.emitirApoliceHistorica(termos);
      const endereco = await fabrica.apolices(0);
      const apolice = await ethers.getContractAt("ApoliceHistorica", endereco);
      await apolice.depositarGarantia({ value: termos.valorIndenizacao });
      const t = {
        modoHistorico: true,
        estacao: "A770",
        inicioHistorico: "2024-02-07",
        fimHistorico: "2024-02-09",
        limiarClimatico: 2,
        hashSerie: await hashDaSerie(banco, "2024-02-07", "2024-02-09"),
      };
      const { semearParaTeste } =
        await import("../../backend/fixtures/semente.js");
      const { registrarApoliceEmitida } =
        await import("../../../backend/src/dominio/apolices.js");
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
        `INSERT INTO propostas (produtor_id,talhao_id,produto_id,area_segurada_ha,carteira_produtor,valor_indenizacao_wei,premio_wei,termos,hash_termos)
        VALUES ($1,$2,$3,1,$4,$5,1,$6,$7)`,
        [
          produtores[0].id,
          talhoes[0].id,
          produtos[0].id,
          produtor.address.toLowerCase(),
          String(termos.valorIndenizacao),
          JSON.stringify(t),
          termos.hashTermos,
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
        publicar: async ({ periodo, indiceClimatico }) => {
          const tx = await apolice
            .connect(oraculo)
            .publicarIndices(periodo, indiceClimatico);
          const recibo = await tx.wait();
          return {
            txHash: tx.hash,
            bloco: recibo.blockNumber,
            gasUsado: recibo.gasUsed,
            gasEstimado: String(recibo.gasUsed),
            custoWei: recibo.fee,
            enviadoEm: new Date().toISOString(),
            confirmadoEm: new Date().toISOString(),
            acionouPagamento: true,
            oraculo: oraculo.address,
          };
        },
      };
      // O relato nao e parte da avaliacao; seu SQL e coberto pela suite do backend.
      backend.relatarPublicacao = async () => ({});
      const servico = new ServicoOraculo({
        publicador,
        backend,
        fila: new FilaDePublicacoes(path.join(tmp, `fila-${Date.now()}.json`)),
        registro: new RegistroDePublicacoes(
          path.join(tmp, "publicacoes.jsonl"),
        ),
        reputacao: new RegistroReputacao(),
        opcoes: { esperaBaseMs: 1 },
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
    } finally {
      if (servidor) await new Promise((resolve) => servidor.close(resolve));
      await banco.fechar();
    }
  });
});
