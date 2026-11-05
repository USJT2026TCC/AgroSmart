const { expect } = require("../fixtures/ajuda.js");
const { ethers } = require("hardhat");
const { Situacao, VALOR_INDENIZACAO, b32, montarTermos, publicar } = require("../fixtures/ajuda.js");

/**
 * Testes da fabrica de apolices.
 *
 * Cobre o RF09 (implantar na rede, na emissao, o contrato da apolice
 * parametrizado) e a HU09 (a emissao cria o contrato com os termos da proposta).
 */
describe("ApoliceFactory", function () {
  async function implantarFabrica() {
    const [seguradora, produtor, oraculo, estranho] = await ethers.getSigners();

    const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
    await registry.connect(seguradora).autorizar(oraculo.address);

    const factory = await ethers.deployContract("ApoliceFactory", [
      await registry.getAddress(),
      seguradora.address,
    ]);

    return { registry, factory, seguradora, produtor, oraculo, estranho };
  }

  it("recusa implantacao com enderecos zerados", async function () {
    const [seguradora] = await ethers.getSigners();
    const fabrica = await ethers.getContractFactory("ApoliceFactory");

    await expect(
      fabrica.deploy(ethers.ZeroAddress, seguradora.address),
    ).to.be.revertedWithCustomError(fabrica, "EnderecoInvalido");

    await expect(
      fabrica.deploy(seguradora.address, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(fabrica, "EnderecoInvalido");
  });

  it("emite a apolice e registra o endereco implantado", async function () {
    const { factory, seguradora, produtor, registry } = await implantarFabrica();

    const termos = await montarTermos({
      produtor: produtor.address,
      registry: ethers.ZeroAddress, // sera sobrescrito pela fabrica
    });

    await expect(factory.connect(seguradora).emitirApoliceHistorica(termos)).to.emit(
      factory,
      "ApoliceEmitida",
    );

    expect(BigInt((await apolicesEmitidas(factory)).length)).to.equal(1);

    const endereco = (await apolicesEmitidas(factory))[Number(0)];
    const apolice = await ethers.getContractAt("ApoliceHistorica", endereco);
    const gravados = await apolice.verTermos();

    expect(gravados.produtor).to.equal(produtor.address);
    expect(gravados.registry).to.equal(await registry.getAddress());
    expect(await apolice.seguradora()).to.equal(seguradora.address);
    expect(await apolice.situacao()).to.equal(Situacao.AGUARDANDO_GARANTIA);
  });

  it("sobrescreve o registro informado, para nenhuma apolice apontar para outra lista", async function () {
    const { factory, seguradora, produtor, registry } = await implantarFabrica();

    const registroFalso = await ethers.deployContract("OracleRegistry", [produtor.address]);

    const termos = await montarTermos({
      produtor: produtor.address,
      registry: await registroFalso.getAddress(),
    });

    await factory.connect(seguradora).emitirApoliceHistorica(termos);

    const apolice = await ethers.getContractAt(
      "ApoliceHistorica",
      (await apolicesEmitidas(factory))[Number(0)],
    );
    const gravados = await apolice.verTermos();

    expect(gravados.registry).to.equal(await registry.getAddress());
    expect(gravados.registry).to.not.equal(await registroFalso.getAddress());
  });

  it("recusa emissao por quem nao e a seguradora", async function () {
    const { factory, produtor, estranho } = await implantarFabrica();

    const termos = await montarTermos({
      produtor: produtor.address,
      registry: ethers.ZeroAddress,
    });

    await expect(factory.connect(estranho).emitirApoliceHistorica(termos))
      .to.be.revertedWithCustomError(factory, "NaoEhSeguradora")
      .withArgs(estranho.address);
  });

  it("uma apolice emitida pela fabrica opera normalmente ate a liquidacao", async function () {
    const { factory, seguradora, produtor, oraculo } = await implantarFabrica();

    const termos = await montarTermos({
      produtor: produtor.address,
      registry: ethers.ZeroAddress,
    });

    await factory.connect(seguradora).emitirApoliceHistorica(termos);

    const apolice = await ethers.getContractAt(
      "ApoliceHistorica",
      (await apolicesEmitidas(factory))[Number(0)],
    );
    await apolice.connect(seguradora).depositarGarantia({ value: VALOR_INDENIZACAO });

    await expect(publicar(apolice, oraculo, 20241201, 35)).to.changeEtherBalance(
      produtor,
      VALOR_INDENIZACAO,
    );

    expect(await apolice.situacao()).to.equal(Situacao.LIQUIDADA);
  });

  it("nao registra a apolice quando a implantacao falha", async function () {
    const { factory, seguradora } = await implantarFabrica();

    const termos = await montarTermos({
      produtor: ethers.ZeroAddress,
      registry: ethers.ZeroAddress,
    });

    await expect(factory.connect(seguradora).emitirApoliceHistorica(termos)).to.be.reverted;

    expect(BigInt((await apolicesEmitidas(factory)).length)).to.equal(0);
  });

  it("guarda as apolices na ordem de emissao", async function () {
    const { factory, seguradora, produtor } = await implantarFabrica();
    const base = await montarTermos({ produtor: produtor.address, registry: ethers.ZeroAddress });

    await factory.connect(seguradora).emitirApoliceHistorica({ ...base, talhao: b32("talhao-01") });
    await factory.connect(seguradora).emitirApoliceHistorica({ ...base, talhao: b32("talhao-02") });

    expect(BigInt((await apolicesEmitidas(factory)).length)).to.equal(2);
    const primeira = await ethers.getContractAt(
      "ApoliceHistorica",
      (await apolicesEmitidas(factory))[Number(0)],
    );
    expect((await primeira.verTermos()).talhao).to.equal(b32("talhao-01"));
  });

  it("recusa registro administrado por outra seguradora", async function () {
    const [seguradora, outra] = await ethers.getSigners();
    const registro = await ethers.deployContract("OracleRegistry", [outra.address]);
    const Factory = await ethers.getContractFactory("ApoliceFactory");

    await expect(
      Factory.deploy(await registro.getAddress(), seguradora.address),
    ).to.be.revertedWithCustomError(Factory, "EnderecoInvalido");
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
