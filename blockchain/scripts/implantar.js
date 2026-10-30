/** Publica OracleRegistry e ApoliceFactory na Sepolia e grava o manifesto público.
 * Execute somente para criar uma implantação, usando a conta da seguradora. Apólices
 * da implantação anterior continuam na rede, mas deixam de ser acompanhadas.
 */
const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

async function main() {
  const arquivo = path.resolve(__dirname, "../implantacoes/sepolia.json");
  if (fs.existsSync(arquivo) && process.env.NOVA_IMPLANTACAO !== "1")
    throw new Error(
      "Já existe uma implantação configurada. Uma nova publicação exige NOVA_IMPLANTACAO=1 e substituirá o manifesto local.",
    );
  if (!process.env.CHAVE_PRIVADA_SEGURADORA)
    throw new Error("Configure CHAVE_PRIVADA_SEGURADORA para publicar contratos.");
  const [seguradora] = await ethers.getSigners();
  if (
    !seguradora ||
    seguradora.address.toLowerCase() !==
      new ethers.Wallet(process.env.CHAVE_PRIVADA_SEGURADORA).address.toLowerCase()
  )
    throw new Error("A conta de publicação deve ser a seguradora configurada.");

  if (
    network.name !== "sepolia" ||
    Number((await ethers.provider.getNetwork()).chainId) !== 11155111
  )
    throw new Error("Implantação de uso exclusiva Sepolia; redes locais pertencem aos testes.");
  if (!process.env.CHAVE_PRIVADA_ORACULO)
    throw new Error("Configure CHAVE_PRIVADA_ORACULO; o oráculo autorizado é a conta dessa chave.");
  const enderecoOraculo = new ethers.Wallet(process.env.CHAVE_PRIVADA_ORACULO).address;

  if (enderecoOraculo.toLowerCase() === seguradora.address.toLowerCase())
    throw new Error("Seguradora e oráculo devem usar contas diferentes.");

  console.log(`Rede........: ${network.name}`);
  console.log(`Seguradora..: ${seguradora.address}`);
  console.log(`Oraculo.....: ${enderecoOraculo}`);
  console.log("");

  // Inclui todos os eventos da implantação na varredura do indexador.
  const blocoInicial = await ethers.provider.getBlockNumber();

  // Cada implantacao publica um registro proprio, administrado pela mesma seguradora
  // da fabrica, e autoriza o oraculo antes de qualquer apolice existir.
  const registro = await ethers.deployContract("OracleRegistry", [seguradora.address]);
  await registro.waitForDeployment();
  const enderecoRegistry = await registro.getAddress();
  await (await registro.autorizar(enderecoOraculo)).wait();
  console.log(`Registro: ${enderecoRegistry}`);

  // ---------------------------------------------------------------- fabrica
  const factory = await ethers.deployContract("ApoliceFactory", [
    enderecoRegistry,
    seguradora.address,
  ]);
  await factory.waitForDeployment();
  const enderecoFactory = await factory.getAddress();
  const recibo = await factory.deploymentTransaction().wait();
  console.log(`ApoliceFactory implantada em ${enderecoFactory}`);

  // ---------------------------------------------------------------- registro em disco
  const implantacao = {
    versaoProtocolo: "clima-historico-v4",
    rede: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    implantadoEm: new Date().toISOString(),
    blocoInicial,
    txImplantacao: recibo.hash,
    gasImplantacao: recibo.gasUsed.toString(),
    seguradora: seguradora.address,
    oraculoAutorizado: enderecoOraculo,
    contratos: {
      OracleRegistry: enderecoRegistry,
      ApoliceFactory: enderecoFactory,
    },
  };

  const destino = path.join(__dirname, "..", "implantacoes");
  fs.mkdirSync(destino, { recursive: true });

  const temporario = arquivo + ".tmp";
  fs.writeFileSync(temporario, `${JSON.stringify(implantacao, null, 2)}\n`);
  fs.renameSync(temporario, arquivo);

  console.log("");
  console.log(`Enderecos gravados em implantacoes/${network.name}.json`);
}

main().catch((erro) => {
  console.error(
    erro.shortMessage ||
      (erro.message && !/https?:|privateKey|requestBody/i.test(erro.message)
        ? erro.message
        : "Falha na implantação. Confira configuração e disponibilidade do RPC."),
  );
  process.exitCode = 1;
});
