require("@nomicfoundation/hardhat-toolbox");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

/**
 * Configuracao do ambiente de contratos do AgroSmart.
 *
 * Sepolia é a rede de uso. Redes locais ficam em testes/.
 *
 * Nenhuma chave privada aparece aqui. Elas sao lidas de variaveis de ambiente
 * definidas no arquivo .env, que esta no .gitignore (RNF14).
 */

const CHAVE_SEGURADORA = process.env.CHAVE_PRIVADA_SEGURADORA;
const RPC_SEPOLIA = process.env.RPC_SEPOLIA || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const contasSepolia = [CHAVE_SEGURADORA].filter(Boolean);

// Preço fixo opcional em gwei; sem valor, usa a estimativa do provedor.
const PRECO_GAS_GWEI = process.env.PRECO_GAS_GWEI;
const precoGasSepolia = PRECO_GAS_GWEI ? Math.round(Number(PRECO_GAS_GWEI) * 1e9) : "auto";
if (precoGasSepolia !== "auto" && (!Number.isSafeInteger(precoGasSepolia) || precoGasSepolia <= 0))
  throw new Error("PRECO_GAS_GWEI deve representar um preco positivo de gas em wei.");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      // Configuracao de compilacao usada na implantacao e na verificacao do explorador.
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // Rede de uso; as redes locais pertencem à configuração em testes/.
    sepolia: {
      url: RPC_SEPOLIA,
      accounts: contasSepolia,
      chainId: 11155111,
      gasPrice: precoGasSepolia,
    },
  },

  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};
