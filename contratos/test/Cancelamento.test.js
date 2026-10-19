const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const { Situacao, VALOR_INDENIZACAO, DIA, montarTermos, cenarioApoliceAtiva, publicar } =
  require("./helpers");

/**
 * Cancelamento antes da vigencia (RF10).
 *
 * Movimenta valor (a garantia volta a seguradora), entao o teste cobre, alem do
 * caminho feliz, os caminhos de recusa e o caso de transferencia que falha.
 */

/** Apolice cuja vigencia so comeca daqui a dez dias. */
async function cenarioVigenciaFutura({ depositar = true } = {}) {
  const [seguradora, produtor, oraculo, estranho] = await ethers.getSigners();

  const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
  await registry.connect(seguradora).autorizar(oraculo.address);

  const agora = await time.latest();
  const termos = await montarTermos({
    produtor: produtor.address,
    registry: await registry.getAddress(),
    vigenciaInicio: agora + 10 * DIA,
    vigenciaFim: agora + 190 * DIA,
  });

  const apolice = await ethers.deployContract("ApolicePolicy", [seguradora.address, termos]);
  if (depositar) {
    await apolice.connect(seguradora).depositarGarantia({ value: termos.valorIndenizacao });
  }

  return { apolice, termos, seguradora, produtor, oraculo, estranho };
}

describe("Cancelamento antes da vigencia (RF10)", function () {
  it("a seguradora cancela e recebe a garantia de volta", async function () {
    const { apolice, seguradora } = await cenarioVigenciaFutura();

    const tx = apolice.connect(seguradora).cancelar();

    await expect(tx)
      .to.emit(apolice, "ApoliceCancelada")
      .withArgs(seguradora.address, VALOR_INDENIZACAO);
    await expect(tx).to.changeEtherBalances(
      [apolice, seguradora],
      [-VALOR_INDENIZACAO, VALOR_INDENIZACAO],
    );

    expect(await apolice.situacao()).to.equal(Situacao.CANCELADA);
    expect(await apolice.garantiaRetida()).to.equal(0);
  });

  it("o produtor titular tambem pode cancelar, e a garantia volta a seguradora", async function () {
    const { apolice, seguradora, produtor } = await cenarioVigenciaFutura();

    await expect(apolice.connect(produtor).cancelar()).to.changeEtherBalances(
      [seguradora, produtor],
      [VALOR_INDENIZACAO, 0],
    );

    expect(await apolice.situacao()).to.equal(Situacao.CANCELADA);
  });

  it("cancela antes do deposito, sem transferencia nenhuma", async function () {
    const { apolice, produtor } = await cenarioVigenciaFutura({ depositar: false });

    await expect(apolice.connect(produtor).cancelar())
      .to.emit(apolice, "ApoliceCancelada")
      .withArgs(produtor.address, 0);

    expect(await apolice.situacao()).to.equal(Situacao.CANCELADA);
  });

  it("recusa quem nao e parte do contrato", async function () {
    const { apolice, estranho, oraculo } = await cenarioVigenciaFutura();

    for (const conta of [estranho, oraculo]) {
      await expect(apolice.connect(conta).cancelar())
        .to.be.revertedWithCustomError(apolice, "OrigemNaoAutorizada")
        .withArgs(conta.address);
    }
  });

  it("recusa depois do inicio da vigencia", async function () {
    const { apolice, termos, produtor } = await cenarioVigenciaFutura();

    await time.increaseTo(termos.vigenciaInicio);

    await expect(apolice.connect(produtor).cancelar()).to.be.revertedWithCustomError(
      apolice,
      "VigenciaIniciada",
    );
    expect(await apolice.situacao()).to.equal(Situacao.ATIVA);
  });

  it("nao cancela duas vezes", async function () {
    const { apolice, seguradora } = await cenarioVigenciaFutura();

    await apolice.connect(seguradora).cancelar();

    await expect(apolice.connect(seguradora).cancelar())
      .to.be.revertedWithCustomError(apolice, "SituacaoInvalida")
      .withArgs(Situacao.CANCELADA, Situacao.ATIVA);
  });

  it("apolice cancelada nao aceita garantia nem publicacao", async function () {
    const { apolice, termos, seguradora, oraculo } = await cenarioVigenciaFutura({
      depositar: false,
    });

    await apolice.connect(seguradora).cancelar();
    await time.increaseTo(termos.vigenciaInicio);

    await expect(
      apolice.connect(seguradora).depositarGarantia({ value: VALOR_INDENIZACAO }),
    ).to.be.revertedWithCustomError(apolice, "SituacaoInvalida");
    await expect(publicar(apolice, oraculo, 20261101, 40)).to.be.revertedWithCustomError(
      apolice,
      "SituacaoInvalida",
    );
  });

  it("nao cancela apolice ja liquidada", async function () {
    const { apolice, seguradora, oraculo } = await cenarioApoliceAtiva();

    await publicar(apolice, oraculo, 20261101, 40);

    await expect(apolice.connect(seguradora).cancelar())
      .to.be.revertedWithCustomError(apolice, "SituacaoInvalida")
      .withArgs(Situacao.LIQUIDADA, Situacao.ATIVA);
  });

  describe("com uma seguradora hostil", function () {
    async function cenarioHostil() {
      const [, produtor] = await ethers.getSigners();

      const maliciosa = await ethers.deployContract("SeguradoraMaliciosa");
      const enderecoMaliciosa = await maliciosa.getAddress();

      const registry = await ethers.deployContract("OracleRegistry", [enderecoMaliciosa]);
      const agora = await time.latest();
      const termos = await montarTermos({
        produtor: produtor.address,
        registry: await registry.getAddress(),
        vigenciaInicio: agora + 10 * DIA,
        vigenciaFim: agora + 190 * DIA,
      });

      const apolice = await ethers.deployContract("ApolicePolicy", [enderecoMaliciosa, termos]);
      await maliciosa.configurar(await apolice.getAddress());
      await maliciosa.depositar({ value: VALOR_INDENIZACAO });

      return { apolice, maliciosa };
    }

    it("reverte tudo quando a devolucao e recusada, e a apolice continua ATIVA", async function () {
      const { apolice, maliciosa } = await cenarioHostil();

      await maliciosa.definirModo(true, false);

      await expect(maliciosa.cancelar()).to.be.revertedWithCustomError(
        apolice,
        "FalhaNaTransferencia",
      );
      expect(await apolice.situacao()).to.equal(Situacao.ATIVA);
      expect(await apolice.garantiaRetida()).to.equal(VALOR_INDENIZACAO);
    });

    it("barra a reentrada durante a devolucao", async function () {
      const { apolice, maliciosa } = await cenarioHostil();

      await maliciosa.definirModo(false, true);
      await maliciosa.cancelar();

      expect(await maliciosa.vezesRecebido()).to.equal(1);
      expect(await maliciosa.reentradaFalhou()).to.equal(true);
      expect(await apolice.situacao()).to.equal(Situacao.CANCELADA);

      // A reentrada tentou cancelar de novo e parou na guarda, antes de tudo.
      const erro = apolice.interface.parseError(await maliciosa.ultimoErro());
      expect(erro.name).to.equal("ReentranciaDetectada");
    });
  });
});
