/** Evidencia reproduzivel local; nao usa carteiras nem valores reais. */
const { ethers, network } = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  if (network.name !== "hardhat") throw new Error("Execute somente na rede efemera hardhat.");
  const [seguradora, produtor, oraculo, estranho] = await ethers.getSigners();
  const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
  await registry.waitForDeployment();
  await (await registry.autorizar(oraculo.address)).wait();
  const factory = await ethers.deployContract("ApoliceFactory", [
    await registry.getAddress(),
    seguradora.address,
  ]);
  await factory.waitForDeployment();
  const agora = (await ethers.provider.getBlock("latest")).timestamp;
  const valor = ethers.parseEther("1");
  const termos = {
    produtor: produtor.address,
    registry: await registry.getAddress(),
    cultura: ethers.encodeBytes32String("soja"),
    talhao: ethers.encodeBytes32String("demo-ficticia"),
    modoPagamento: 0,
    limiarClimatico: 30,
    limiarClimaticoIntegral: 0,
    vigenciaInicio: agora,
    vigenciaFim: agora + 180 * 86400,
    valorIndenizacao: valor,
    hashTermos: ethers.id("demonstracao experimental integral v1"),
  };
  const emitir = async (t) => {
    const recibo = await (await factory.emitirApolice(t)).wait();
    const logs = recibo.logs.map((l) => {
      try {
        return factory.interface.parseLog(l);
      } catch {
        return null;
      }
    });
    const evento = logs.find((l) => l?.name === "ApoliceEmitida");
    const endereco = evento.args.apolice;
    return { apolice: await ethers.getContractAt("ApolicePolicy", endereco), recibo };
  };
  const { apolice, recibo } = await emitir(termos);
  const garantia = await (await apolice.depositarGarantia({ value: valor })).wait();
  let recusouOrigem = false;
  try {
    await apolice.connect(estranho).publicarIndices(20261001, 30);
  } catch {
    recusouOrigem = true;
  }
  const naoAcionou = await (await apolice.connect(oraculo).publicarIndices(20261001, 29)).wait();
  const antes = await ethers.provider.getBalance(produtor.address);
  const pagamento = await (await apolice.connect(oraculo).publicarIndices(20261002, 30)).wait();
  const recebido = (await ethers.provider.getBalance(produtor.address)) - antes;
  let recusouRepeticao = false;
  try {
    await apolice.connect(oraculo).publicarIndices(20261003, 31);
  } catch {
    recusouRepeticao = true;
  }
  const futuro = { ...termos, vigenciaInicio: agora + 86400 };
  const outra = await emitir(futuro);
  await (await outra.apolice.depositarGarantia({ value: valor })).wait();
  const cancelamento = await (await outra.apolice.connect(produtor).cancelar()).wait();
  const resultado = {
    protocolo: "clima-integral-v1",
    rede: network.name,
    chainId: 31337,
    limiarExperimentalDias: 30,
    valorContratadoWei: valor.toString(),
    recebidoWei: recebido.toString(),
    estadoLiquidada: Number(await apolice.situacao()),
    saldoFinalWei: (await apolice.garantiaRetida()).toString(),
    recusouOrigem,
    recusouRepeticao,
    cancelada: Number(await outra.apolice.situacao()) === 4,
    saldoCanceladaWei: (await outra.apolice.garantiaRetida()).toString(),
    gas: {
      emissao: recibo.gasUsed.toString(),
      garantia: garantia.gasUsed.toString(),
      publicacaoSemPagamento: naoAcionou.gasUsed.toString(),
      publicacaoComPagamento: pagamento.gasUsed.toString(),
      cancelamento: cancelamento.gasUsed.toString(),
    },
    nota: "Dados sinteticos de indice para testar software. Nao validam perdas agronomicas. Gas local nao e gas da Sepolia.",
  };
  if (recebido !== valor || !recusouOrigem || !recusouRepeticao || !resultado.cancelada)
    throw new Error("Cenario divergente");
  const destino = path.join(__dirname, "../../docs/resultados/clima-integral-2026-10-16");
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(
    path.join(destino, "gas-e-fluxo.json"),
    JSON.stringify(resultado, null, 2) + "\n",
  );
  console.log(JSON.stringify(resultado, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
