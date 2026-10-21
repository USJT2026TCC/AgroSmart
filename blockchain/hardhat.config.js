require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * Configuracao do ambiente de contratos do AgroSmart.
 *
 * Sepolia é a rede de uso. Redes locais ficam em testes/.
 *
 * Nenhuma chave privada aparece aqui. Elas sao lidas de variaveis de ambiente
 * definidas no arquivo .env, que esta no .gitignore (RNF14).
 */

const CHAVE_SEGURADORA = process.env.CHAVE_PRIVADA_SEGURADORA;
const CHAVE_ORACULO = process.env.CHAVE_PRIVADA_ORACULO;
const RPC_SEPOLIA = process.env.RPC_SEPOLIA || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const contasSepolia = [CHAVE_SEGURADORA, CHAVE_ORACULO].filter(Boolean);

// Preço fixo opcional em gwei; sem valor, usa a estimativa do provedor.
const PRECO_GAS_GWEI = process.env.PRECO_GAS_GWEI;
const precoGasSepolia = PRECO_GAS_GWEI ? Math.round(Number(PRECO_GAS_GWEI) * 1e9) : "auto";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      // O otimizador fica ligado porque o RNF07 exige medir e documentar o gas de
      // cada funcao publica. Medir com o otimizador desligado produziria numeros
      // que nao correspondem ao que seria implantado de fato.
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

  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
