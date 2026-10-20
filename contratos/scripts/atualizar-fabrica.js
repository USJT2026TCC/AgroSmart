/** Atualiza somente a fabrica Sepolia, preservando registro, identidades e banco.
 * Nao altera contratos antigos e nao transfere garantias. Consome somente gas
 * de teste da seguradora configurada. Executar apos as verificacoes locais.
 */
const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");
async function main() {
  if (
    network.name !== "sepolia" ||
    Number((await ethers.provider.getNetwork()).chainId) !== 11155111
  )
    throw new Error("Esta atualizacao e exclusiva Sepolia.");
  const arquivo = path.resolve(__dirname, "../implantacoes/sepolia.json");
  const anterior = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  if (anterior.versaoProtocolo === "clima-integral-historico-v2")
    throw new Error(
      "Fabrica historica ja configurada; nao reimplantar desnecessariamente.",
    );
  const [seguradora] = await ethers.getSigners();
  if (seguradora.address.toLowerCase() !== anterior.seguradora.toLowerCase())
    throw new Error("Conta difere da seguradora atual.");
  const registry = await ethers.getContractAt(
    "OracleRegistry",
    anterior.contratos.OracleRegistry,
  );
  if (
    (await registry.seguradora()).toLowerCase() !==
      anterior.seguradora.toLowerCase() ||
    !(await registry.ehAutorizado(anterior.oraculoAutorizado))
  )
    throw new Error("Registro atual incompativel.");
  const blocoInicial = await ethers.provider.getBlockNumber();
  const fabrica = await ethers.deployContract("ApoliceFactory", [
    anterior.contratos.OracleRegistry,
    seguradora.address,
  ]);
  await fabrica.waitForDeployment();
  const endereco = await fabrica.getAddress();
  const recibo = await fabrica.deploymentTransaction().wait();
  const anteriorPublico = path.resolve(
    __dirname,
    "../../testes/evidencias/implantacoes",
  );
  fs.mkdirSync(anteriorPublico, { recursive: true });
  const backup = path.join(
    anteriorPublico,
    `sepolia-${anterior.contratos.ApoliceFactory.toLowerCase()}.json`,
  );
  if (!fs.existsSync(backup))
    fs.writeFileSync(backup, JSON.stringify(anterior, null, 2) + "\n");
  const nova = {
    ...anterior,
    versaoProtocolo: "clima-integral-historico-v2",
    implantadoEm: new Date().toISOString(),
    blocoInicial,
    instanciaDados:
      anterior.instanciaDados ??
      `sepolia-${anterior.contratos.ApoliceFactory.toLowerCase()}`,
    contratos: { ...anterior.contratos, ApoliceFactory: endereco },
    txImplantacao: fabrica.deploymentTransaction().hash,
    gasImplantacao: String(recibo.gasUsed),
  };
  const temporario = arquivo + ".tmp";
  fs.writeFileSync(temporario, JSON.stringify(nova, null, 2) + "\n");
  fs.renameSync(temporario, arquivo);
  console.log(`Fabrica historica: ${endereco}`);
  console.log(
    `Registro e banco preservados. Gas: ${recibo.gasUsed}. Tx: ${nova.txImplantacao}`,
  );
}
main().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
