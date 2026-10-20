const { ethers } = require("hardhat");
const { expect, montarTermos } = require("./helpers");
describe("Apolice historica explicita", function () {
  async function cenario(extra = {}) {
    const [seguradora, produtor, oraculo, estranho] = await ethers.getSigners();
    const registry = await ethers.deployContract("OracleRegistry", [
      seguradora.address,
    ]);
    await registry.autorizar(oraculo.address);
    const termos = await montarTermos({
      produtor: produtor.address,
      registry: await registry.getAddress(),
      vigenciaInicio: 1707264000,
      vigenciaFim: 1738972799,
      limiarClimatico: 10,
      ...extra,
    });
    const apolice = await ethers.deployContract("ApoliceHistorica", [
      seguradora.address,
      termos,
    ]);
    await apolice.depositarGarantia({ value: termos.valorIndenizacao });
    return { seguradora, produtor, oraculo, estranho, termos, apolice };
  }
  it("paga hoje por evento historico dentro da cobertura, uma unica vez", async () => {
    const { apolice, oraculo, produtor, termos } = await cenario();
    expect(await apolice.modoHistorico()).to.equal(true);
    await expect(
      apolice.connect(oraculo).publicarIndices(20240216, 10),
    ).to.changeEtherBalance(produtor, termos.valorIndenizacao);
    expect(await apolice.situacao()).to.equal(2);
    await expect(
      apolice.connect(oraculo).publicarIndices(20240217, 11),
    ).to.be.revertedWithCustomError(apolice, "SituacaoInvalida");
  });
  it("rejeita periodo fora da cobertura, data invalida, indice anterior e origem nao autorizada", async () => {
    const { apolice, oraculo, estranho } = await cenario();
    for (const [p, i] of [
      [20240206, 1],
      [20250208, 1],
      [20240230, 1],
      [20240207, 2],
    ])
      await expect(
        apolice.connect(oraculo).publicarIndices(p, i),
      ).to.be.revertedWithCustomError(apolice, "PeriodoHistoricoInvalido");
    await expect(
      apolice.connect(estranho).publicarIndices(20240207, 1),
    ).to.be.revertedWithCustomError(apolice, "OrigemNaoAutorizada");
    await apolice.connect(oraculo).publicarIndices(20240209, 3);
    await expect(
      apolice.connect(oraculo).publicarIndices(20240208, 2),
    ).to.be.revertedWithCustomError(apolice, "PeriodoHistoricoInvalido");
  });
  it("garantia nao pode ser retirada antes de processar fim historico", async () => {
    const { apolice, oraculo } = await cenario();
    await expect(apolice.resgatarGarantia()).to.be.revertedWithCustomError(
      apolice,
      "VigenciaEmCurso",
    );
    await apolice.connect(oraculo).publicarIndices(20250207, 0);
    await apolice.resgatarGarantia();
    expect(await apolice.situacao()).to.equal(3);
  });
  it("permite cancelar antes da reproducao, mas nao depois da primeira publicacao", async () => {
    const a = await cenario();
    await a.apolice.connect(a.produtor).cancelar();
    expect(await a.apolice.situacao()).to.equal(4);
    const b = await cenario();
    await b.apolice.connect(b.oraculo).publicarIndices(20240207, 0);
    await expect(b.apolice.cancelar()).to.be.revertedWithCustomError(
      b.apolice,
      "VigenciaIniciada",
    );
  });
});
