const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const {
  ModoPagamento,
  Situacao,
  VALOR_INDENIZACAO,
  DIA,
  hash,
  montarTermos,
  cenarioApoliceAtiva,
  publicar,
} = require("./helpers");

/**
 * Testes da apolice.
 *
 * A organizacao acompanha o ciclo de vida do contrato: implantacao, deposito da
 * garantia, publicacao de indices, avaliacao da condicao, liquidacao e encerramento.
 * Cada bloco cita o requisito que exercita, de modo que a rastreabilidade exigida
 * pelo RNF12 fique visivel no proprio codigo de teste.
 */
describe("ApolicePolicy", function () {
  // -------------------------------------------------------------------------
  // HU01 - Contrato da apolice em rede local (RF07, RF08)
  // -------------------------------------------------------------------------
  describe("implantacao (RF07, RF08)", function () {
    async function implantarSemGarantia() {
      const [seguradora, produtor, oraculo] = await ethers.getSigners();

      const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
      await registry.connect(seguradora).autorizar(oraculo.address);

      const termos = await montarTermos({
        produtor: produtor.address,
        registry: await registry.getAddress(),
      });

      const apolice = await ethers.deployContract("ApolicePolicy", [seguradora.address, termos]);

      return { registry, apolice, termos, seguradora, produtor, oraculo };
    }

    it("recebe condicao de gatilho, carteira do produtor e registro de oraculos", async function () {
      const { apolice, termos, seguradora, registry } = await implantarSemGarantia();

      const gravados = await apolice.verTermos();

      expect(await apolice.seguradora()).to.equal(seguradora.address);
      expect(gravados.produtor).to.equal(termos.produtor);
      expect(gravados.registry).to.equal(await registry.getAddress());
      expect(gravados.limiarClimatico).to.equal(30);
      expect(gravados.valorIndenizacao).to.equal(VALOR_INDENIZACAO);
      expect(await apolice.situacao()).to.equal(Situacao.AGUARDANDO_GARANTIA);
    });

    it("grava o resumo criptografico dos termos, legivel por consulta publica", async function () {
      const { apolice, termos } = await implantarSemGarantia();

      const gravados = await apolice.verTermos();

      expect(gravados.hashTermos).to.equal(termos.hashTermos);
      expect(gravados.hashTermos).to.equal(hash("termos-da-apolice-v1"));

      // Qualquer alteracao no documento produz um resumo diferente do gravado,
      // e portanto se torna detectavel (RF08).
      expect(gravados.hashTermos).to.not.equal(hash("termos-da-apolice-v2"));
    });

    it("emite ApoliceImplantada na criacao", async function () {
      const [seguradora, produtor] = await ethers.getSigners();

      const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
      const termos = await montarTermos({
        produtor: produtor.address,
        registry: await registry.getAddress(),
      });

      const fabrica = await ethers.getContractFactory("ApolicePolicy");
      const apolice = await fabrica.deploy(seguradora.address, termos);

      await expect(apolice.deploymentTransaction())
        .to.emit(apolice, "ApoliceImplantada")
        .withArgs(
          seguradora.address,
          produtor.address,
          termos.talhao,
          termos.valorIndenizacao,
          termos.hashTermos,
        );
    });

    describe("recusa de parametros invalidos", function () {
      async function tentarImplantar(overrides, seguradoraOverride) {
        const [seguradora, produtor] = await ethers.getSigners();
        const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);

        const termos = await montarTermos({
          produtor: produtor.address,
          registry: await registry.getAddress(),
          ...overrides,
        });

        const fabrica = await ethers.getContractFactory("ApolicePolicy");

        return {
          fabrica,
          promessa: fabrica.deploy(seguradoraOverride ?? seguradora.address, termos),
        };
      }

      it("seguradora com endereco zero", async function () {
        const { fabrica, promessa } = await tentarImplantar({}, ethers.ZeroAddress);
        await expect(promessa).to.be.revertedWithCustomError(fabrica, "EnderecoInvalido");
      });

      it("produtor com endereco zero", async function () {
        const { fabrica, promessa } = await tentarImplantar({ produtor: ethers.ZeroAddress });
        await expect(promessa).to.be.revertedWithCustomError(fabrica, "EnderecoInvalido");
      });

      it("registro de oraculos com endereco zero", async function () {
        const { fabrica, promessa } = await tentarImplantar({ registry: ethers.ZeroAddress });
        await expect(promessa).to.be.revertedWithCustomError(fabrica, "EnderecoInvalido");
      });

      it("produtor igual a seguradora", async function () {
        const [seguradora] = await ethers.getSigners();
        const { fabrica, promessa } = await tentarImplantar({ produtor: seguradora.address });

        await expect(promessa)
          .to.be.revertedWithCustomError(fabrica, "ParametroInvalido")
          .withArgs("produtor igual a seguradora");
      });

      it("valor de indenizacao zerado", async function () {
        const { fabrica, promessa } = await tentarImplantar({ valorIndenizacao: 0 });

        await expect(promessa)
          .to.be.revertedWithCustomError(fabrica, "ParametroInvalido")
          .withArgs("valorIndenizacao");
      });

      it("vigencia que termina antes de comecar", async function () {
        const agora = await time.latest();
        const { fabrica, promessa } = await tentarImplantar({
          vigenciaInicio: agora + 10 * DIA,
          vigenciaFim: agora + DIA,
        });

        await expect(promessa)
          .to.be.revertedWithCustomError(fabrica, "ParametroInvalido")
          .withArgs("vigencia");
      });

      it("resumo dos termos zerado", async function () {
        const { fabrica, promessa } = await tentarImplantar({ hashTermos: ethers.ZeroHash });

        await expect(promessa)
          .to.be.revertedWithCustomError(fabrica, "ParametroInvalido")
          .withArgs("hashTermos");
      });

      it("limiar climatico zerado", async function () {
        const { fabrica, promessa } = await tentarImplantar({ limiarClimatico: 0 });

        await expect(promessa)
          .to.be.revertedWithCustomError(fabrica, "ParametroInvalido")
          .withArgs("limiarClimatico");
      });

      it("recusa modo legado de pagamento parcial", async function () {
        const { fabrica, promessa } = await tentarImplantar({
          modoPagamento: ModoPagamento.ESCALONADO,
          limiarClimatico: 30,
          limiarClimaticoIntegral: 30,
        });

        await expect(promessa)
          .to.be.revertedWithCustomError(fabrica, "ParametroInvalido")
          .withArgs("modoPagamento");
      });
      it("recusa teto reservado diferente de zero no modo integral", async function () {
        const { fabrica, promessa } = await tentarImplantar({ limiarClimaticoIntegral: 60 });
        await expect(promessa)
          .to.be.revertedWithCustomError(fabrica, "ParametroInvalido")
          .withArgs("limiarClimaticoIntegral");
      });
    });
  });

  // -------------------------------------------------------------------------
  // Garantia
  // -------------------------------------------------------------------------
  describe("deposito da garantia", function () {
    async function implantarSemGarantia() {
      const [seguradora, produtor, oraculo, estranho] = await ethers.getSigners();

      const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
      await registry.connect(seguradora).autorizar(oraculo.address);

      const termos = await montarTermos({
        produtor: produtor.address,
        registry: await registry.getAddress(),
      });

      const apolice = await ethers.deployContract("ApolicePolicy", [seguradora.address, termos]);

      return { apolice, termos, seguradora, produtor, oraculo, estranho };
    }

    it("ativa a apolice quando o valor exato e depositado", async function () {
      const { apolice, seguradora } = await implantarSemGarantia();

      await expect(apolice.connect(seguradora).depositarGarantia({ value: VALOR_INDENIZACAO }))
        .to.emit(apolice, "GarantiaDepositada")
        .withArgs(seguradora.address, VALOR_INDENIZACAO);

      expect(await apolice.situacao()).to.equal(Situacao.ATIVA);
      expect(await apolice.garantiaRetida()).to.equal(VALOR_INDENIZACAO);
    });

    it("recusa valor diferente do contratado", async function () {
      const { apolice, seguradora } = await implantarSemGarantia();
      const aMenor = VALOR_INDENIZACAO - 1n;

      await expect(apolice.connect(seguradora).depositarGarantia({ value: aMenor }))
        .to.be.revertedWithCustomError(apolice, "GarantiaIncorreta")
        .withArgs(aMenor, VALOR_INDENIZACAO);
    });

    it("recusa deposito de quem nao e a seguradora", async function () {
      const { apolice, estranho } = await implantarSemGarantia();

      await expect(apolice.connect(estranho).depositarGarantia({ value: VALOR_INDENIZACAO }))
        .to.be.revertedWithCustomError(apolice, "OrigemNaoAutorizada")
        .withArgs(estranho.address);
    });

    it("recusa segundo deposito", async function () {
      const { apolice, seguradora } = await implantarSemGarantia();
      await apolice.connect(seguradora).depositarGarantia({ value: VALOR_INDENIZACAO });

      await expect(apolice.connect(seguradora).depositarGarantia({ value: VALOR_INDENIZACAO }))
        .to.be.revertedWithCustomError(apolice, "SituacaoInvalida")
        .withArgs(Situacao.ATIVA, Situacao.AGUARDANDO_GARANTIA);
    });

    it("recusa transferencia direta para o contrato", async function () {
      const { apolice, seguradora } = await implantarSemGarantia();

      await expect(
        seguradora.sendTransaction({
          to: await apolice.getAddress(),
          value: ethers.parseEther("0.1"),
        }),
      ).to.be.revertedWithCustomError(apolice, "DepositoDireto");
    });

    it("nao aceita publicacao antes da garantia", async function () {
      const { apolice, oraculo } = await implantarSemGarantia();

      await expect(publicar(apolice, oraculo, 20261001, 40))
        .to.be.revertedWithCustomError(apolice, "SituacaoInvalida")
        .withArgs(Situacao.AGUARDANDO_GARANTIA, Situacao.ATIVA);
    });
  });

  // -------------------------------------------------------------------------
  // HU02 - Controle de enderecos autorizados (RF18, RF20)
  // -------------------------------------------------------------------------
  describe("publicacao de indices (RF18, RF20)", function () {
    it("aceita publicacao de endereco autorizado e emite evento com apolice, periodo e indice", async function () {
      const { apolice, oraculo } = await cenarioApoliceAtiva();

      await expect(publicar(apolice, oraculo, 20261001, 10))
        .to.emit(apolice, "IndicesPublicados")
        .withArgs(20261001, oraculo.address, 10);
    });

    it("rejeita publicacao de endereco nao autorizado", async function () {
      const { apolice, estranho } = await cenarioApoliceAtiva();

      await expect(publicar(apolice, estranho, 20261001, 40))
        .to.be.revertedWithCustomError(apolice, "OrigemNaoAutorizada")
        .withArgs(estranho.address);
    });

    it("deixa de aceitar um oraculo revogado no registro", async function () {
      const { apolice, registry, seguradora, oraculo } = await cenarioApoliceAtiva();

      await publicar(apolice, oraculo, 20261001, 10);
      await registry.connect(seguradora).revogar(oraculo.address);

      await expect(publicar(apolice, oraculo, 20261002, 10))
        .to.be.revertedWithCustomError(apolice, "OrigemNaoAutorizada")
        .withArgs(oraculo.address);
    });

    it("rejeita periodo duplicado e preserva o valor original", async function () {
      const { apolice, oraculo } = await cenarioApoliceAtiva();

      await publicar(apolice, oraculo, 20261001, 12);

      await expect(publicar(apolice, oraculo, 20261001, 99))
        .to.be.revertedWithCustomError(apolice, "PeriodoJaPublicado")
        .withArgs(20261001);

      const registro = await apolice.publicacao(20261001);
      expect(registro.indiceClimatico).to.equal(12);
      expect(await apolice.totalPeriodos()).to.equal(1);
    });

    it("registra quem publicou e quando (RNF18)", async function () {
      const { apolice, oraculo } = await cenarioApoliceAtiva();

      await apolice.connect(oraculo).publicarIndices(20261005, 7);

      const registro = await apolice.publicacao(20261005);

      expect(registro.oraculo).to.equal(oraculo.address);
      expect(registro.indiceClimatico).to.equal(7);
      expect(registro.publicadoEm).to.be.greaterThan(0);
    });

    it("mantem a ordem dos periodos publicados", async function () {
      const { apolice, oraculo } = await cenarioApoliceAtiva();

      await publicar(apolice, oraculo, 20261001, 5);
      await publicar(apolice, oraculo, 20261002, 6);
      await publicar(apolice, oraculo, 20261003, 7);

      expect(await apolice.totalPeriodos()).to.equal(3);
      expect(await apolice.periodos(0)).to.equal(20261001);
      expect(await apolice.periodos(2)).to.equal(20261003);
    });

    it("rejeita publicacao antes do inicio da vigencia", async function () {
      const agora = await time.latest();
      const { apolice, oraculo } = await cenarioApoliceAtiva({
        vigenciaInicio: agora + 30 * DIA,
        vigenciaFim: agora + 200 * DIA,
      });

      await expect(publicar(apolice, oraculo, 20261001, 40)).to.be.revertedWithCustomError(
        apolice,
        "ForaDaVigencia",
      );
    });

    it("rejeita publicacao depois do fim da vigencia", async function () {
      const { apolice, oraculo, termos } = await cenarioApoliceAtiva();

      await time.increaseTo(Number(termos.vigenciaFim) + 1);

      await expect(publicar(apolice, oraculo, 20261001, 40)).to.be.revertedWithCustomError(
        apolice,
        "ForaDaVigencia",
      );
    });
  });

  // -------------------------------------------------------------------------
  // HU03 - Avaliacao da condicao e liquidacao (RF23, RF24, RF26)
  // -------------------------------------------------------------------------
  describe("avaliacao da condicao e liquidacao (RF23, RF24, RF26)", function () {
    it("nao paga quando o indice fica abaixo do limiar", async function () {
      const { apolice, oraculo, produtor } = await cenarioApoliceAtiva();

      await expect(publicar(apolice, oraculo, 20261001, 29))
        .to.emit(apolice, "CondicaoAvaliada")
        .withArgs(20261001, false, 0)
        .and.to.not.emit(apolice, "PagamentoExecutado");

      expect(await apolice.situacao()).to.equal(Situacao.ATIVA);
      expect(await apolice.valorPago()).to.equal(0);
      expect(await apolice.garantiaRetida()).to.equal(VALOR_INDENIZACAO);
      expect(await ethers.provider.getBalance(produtor.address)).to.be.greaterThan(0);
    });

    it("paga integralmente quando o indice atinge exatamente o limiar", async function () {
      const { apolice, oraculo, produtor } = await cenarioApoliceAtiva();

      await expect(publicar(apolice, oraculo, 20261001, 30)).to.changeEtherBalance(
        produtor,
        VALOR_INDENIZACAO,
      );

      expect(await apolice.situacao()).to.equal(Situacao.LIQUIDADA);
      expect(await apolice.valorPago()).to.equal(VALOR_INDENIZACAO);
      expect(await apolice.periodoAcionador()).to.equal(20261001);
      expect(await apolice.garantiaRetida()).to.equal(0);
    });

    it("emite CondicaoAvaliada e PagamentoExecutado na mesma transacao", async function () {
      const { apolice, oraculo, produtor } = await cenarioApoliceAtiva();

      await expect(publicar(apolice, oraculo, 20261001, 45))
        .to.emit(apolice, "CondicaoAvaliada")
        .withArgs(20261001, true, 10_000)
        .and.to.emit(apolice, "PagamentoExecutado")
        .withArgs(produtor.address, 20261001, VALOR_INDENIZACAO);
    });

    it("impede acionamento duplicado: nenhuma publicacao e aceita apos a liquidacao", async function () {
      const { apolice, oraculo } = await cenarioApoliceAtiva();

      await publicar(apolice, oraculo, 20261001, 40);

      await expect(publicar(apolice, oraculo, 20261002, 60))
        .to.be.revertedWithCustomError(apolice, "SituacaoInvalida")
        .withArgs(Situacao.LIQUIDADA, Situacao.ATIVA);

      expect(await apolice.valorPago()).to.equal(VALOR_INDENIZACAO);
    });

    it("segue acumulando periodos sem acionar ate a condicao ser atendida", async function () {
      const { apolice, oraculo, produtor } = await cenarioApoliceAtiva();

      await publicar(apolice, oraculo, 20261001, 10);
      await publicar(apolice, oraculo, 20261002, 20);
      await publicar(apolice, oraculo, 20261003, 29);

      expect(await apolice.situacao()).to.equal(Situacao.ATIVA);

      await expect(publicar(apolice, oraculo, 20261004, 31)).to.changeEtherBalance(
        produtor,
        VALOR_INDENIZACAO,
      );

      expect(await apolice.totalPeriodos()).to.equal(4);
      expect(await apolice.periodoAcionador()).to.equal(20261004);
    });
  });

  describe("indenizacao integral em parcela unica", function () {
    for (const indice of [30, 31, 60, 366]) {
      it(`paga 100% uma unica vez com indice ${indice}`, async function () {
        const { apolice, oraculo, produtor } = await cenarioApoliceAtiva();
        await expect(publicar(apolice, oraculo, 20261001, indice)).to.changeEtherBalance(
          produtor,
          VALOR_INDENIZACAO,
        );
        expect(await apolice.valorPago()).to.equal(VALOR_INDENIZACAO);
        expect(await apolice.garantiaRetida()).to.equal(0);
        await expect(publicar(apolice, oraculo, 20261002, indice)).to.be.revertedWithCustomError(
          apolice,
          "SituacaoInvalida",
        );
      });
    }
    it("nao paga no dia anterior ao gatilho", async function () {
      const { apolice, oraculo, produtor } = await cenarioApoliceAtiva();
      await expect(publicar(apolice, oraculo, 20261001, 29)).to.changeEtherBalance(produtor, 0);
      expect(await apolice.situacao()).to.equal(Situacao.ATIVA);
    });
  });

  // -------------------------------------------------------------------------
  // Encerramento
  // -------------------------------------------------------------------------
  describe("resgate da garantia", function () {
    it("devolve a garantia a seguradora apos o fim da vigencia sem acionamento", async function () {
      const { apolice, seguradora, oraculo, termos } = await cenarioApoliceAtiva();

      await publicar(apolice, oraculo, 20261001, 10);
      await time.increaseTo(Number(termos.vigenciaFim) + 1);

      // Os dois matchers sao assincronos e nao podem ser encadeados na mesma
      // assercao, entao o saldo e conferido na chamada e o evento logo depois.
      const transacao = apolice.connect(seguradora).resgatarGarantia();

      await expect(transacao).to.changeEtherBalance(seguradora, VALOR_INDENIZACAO, {
        includeFee: false,
      });
      await expect(transacao)
        .to.emit(apolice, "GarantiaResgatada")
        .withArgs(seguradora.address, VALOR_INDENIZACAO);

      expect(await apolice.situacao()).to.equal(Situacao.ENCERRADA);
      expect(await apolice.garantiaRetida()).to.equal(0);
    });

    it("recusa resgate durante a vigencia", async function () {
      const { apolice, seguradora } = await cenarioApoliceAtiva();

      await expect(apolice.connect(seguradora).resgatarGarantia()).to.be.revertedWithCustomError(
        apolice,
        "VigenciaEmCurso",
      );
    });

    it("recusa resgate de quem nao e a seguradora", async function () {
      const { apolice, estranho, termos } = await cenarioApoliceAtiva();

      await time.increaseTo(Number(termos.vigenciaFim) + 1);

      await expect(apolice.connect(estranho).resgatarGarantia())
        .to.be.revertedWithCustomError(apolice, "OrigemNaoAutorizada")
        .withArgs(estranho.address);
    });

    it("recusa resgate apos pagamento integral, porque nao sobrou saldo", async function () {
      const { apolice, seguradora, oraculo } = await cenarioApoliceAtiva();

      await publicar(apolice, oraculo, 20261001, 40);
      expect(await apolice.garantiaRetida()).to.equal(0);

      await expect(apolice.connect(seguradora).resgatarGarantia()).to.be.revertedWithCustomError(
        apolice,
        "SemSaldoParaResgatar",
      );
    });

    it("recusa resgate na situacao AGUARDANDO_GARANTIA", async function () {
      const [seguradora, produtor, oraculo] = await ethers.getSigners();

      const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
      await registry.connect(seguradora).autorizar(oraculo.address);

      const termos = await montarTermos({
        produtor: produtor.address,
        registry: await registry.getAddress(),
      });

      const apolice = await ethers.deployContract("ApolicePolicy", [seguradora.address, termos]);

      await expect(apolice.connect(seguradora).resgatarGarantia())
        .to.be.revertedWithCustomError(apolice, "SituacaoInvalida")
        .withArgs(Situacao.AGUARDANDO_GARANTIA, Situacao.ATIVA);
    });

    describe("recuperacao de saldo forcado apos pagamento integral", function () {
      async function cenarioComSaldoForcado() {
        const cenario = await cenarioApoliceAtiva();
        await publicar(cenario.apolice, cenario.oraculo, 20261001, 30);
        // Simula ETH forcado por terceiro, que nao passa por receive().
        await ethers.provider.send("hardhat_setBalance", [
          await cenario.apolice.getAddress(),
          ethers.toBeHex(VALOR_INDENIZACAO / 2n),
        ]);

        return cenario;
      }

      it("saldo forcado nao altera o pagamento integral registrado", async function () {
        const { apolice } = await cenarioComSaldoForcado();

        expect(await apolice.situacao()).to.equal(Situacao.LIQUIDADA);
        expect(await apolice.valorPago()).to.equal(VALOR_INDENIZACAO);
        expect(await apolice.garantiaRetida()).to.equal(VALOR_INDENIZACAO / 2n);
      });

      it("a seguradora resgata a sobra de imediato, sem esperar a vigencia", async function () {
        const { apolice, seguradora } = await cenarioComSaldoForcado();
        const sobra = VALOR_INDENIZACAO / 2n;

        const transacao = apolice.connect(seguradora).resgatarGarantia();

        await expect(transacao).to.changeEtherBalance(seguradora, sobra, { includeFee: false });
        await expect(transacao)
          .to.emit(apolice, "GarantiaResgatada")
          .withArgs(seguradora.address, sobra);

        expect(await apolice.garantiaRetida()).to.equal(0);
      });

      it("a apolice continua LIQUIDADA depois do resgate da sobra", async function () {
        const { apolice, seguradora } = await cenarioComSaldoForcado();

        await apolice.connect(seguradora).resgatarGarantia();

        // Trocar para ENCERRADA apagaria, da leitura do estado, o fato de ter
        // havido pagamento ao produtor.
        expect(await apolice.situacao()).to.equal(Situacao.LIQUIDADA);
        expect(await apolice.valorPago()).to.equal(VALOR_INDENIZACAO);
        expect(await apolice.periodoAcionador()).to.equal(20261001);
      });

      it("um segundo resgate da sobra e recusado", async function () {
        const { apolice, seguradora } = await cenarioComSaldoForcado();

        await apolice.connect(seguradora).resgatarGarantia();

        await expect(apolice.connect(seguradora).resgatarGarantia()).to.be.revertedWithCustomError(
          apolice,
          "SemSaldoParaResgatar",
        );
      });

      it("apenas a seguradora resgata a sobra", async function () {
        const { apolice, estranho } = await cenarioComSaldoForcado();

        await expect(apolice.connect(estranho).resgatarGarantia())
          .to.be.revertedWithCustomError(apolice, "OrigemNaoAutorizada")
          .withArgs(estranho.address);
      });
    });

    it("recusa segundo resgate", async function () {
      const { apolice, seguradora, termos } = await cenarioApoliceAtiva();

      await time.increaseTo(Number(termos.vigenciaFim) + 1);
      await apolice.connect(seguradora).resgatarGarantia();

      await expect(apolice.connect(seguradora).resgatarGarantia())
        .to.be.revertedWithCustomError(apolice, "SituacaoInvalida")
        .withArgs(Situacao.ENCERRADA, Situacao.ATIVA);
    });
  });
});
