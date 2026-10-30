import implantacoes from "./implantacoes.json";

/** Sepolia e o manifesto publico, copiado antes do build da interface. */
const SEPOLIA = {
  chave: "sepolia",
  chainId: 11155111,
  nome: "Sepolia",
  moeda: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  explorador: "https://sepolia.etherscan.io",
};

const implantacao = implantacoes.sepolia ?? null;

/** Configuracao da rede de uso. */
export function redeAtiva() {
  return SEPOLIA;
}

/**
 * Enderecos dos contratos implantados.
 * @returns {{OracleRegistry: string, ApoliceFactory: string}|null}
 */
export function enderecosDaRede() {
  return implantacao?.contratos ?? null;
}

/** Bloco a partir do qual vale procurar eventos. Evita varrer a cadeia inteira. */
export function blocoInicial() {
  return implantacao?.blocoInicial ?? 0;
}

/** Dados completos da implantacao: seguradora, oraculo e contratos. */
export function implantacaoDaRede() {
  return implantacao;
}

/** Link do explorador de blocos para uma transacao ou endereco. */
export function linkDoExplorador(hashOuEndereco, tipo = "tx") {
  return `${SEPOLIA.explorador}/${tipo}/${hashOuEndereco}`;
}

/** Formato hexadecimal do chainId, como a MetaMask espera. */
export function chainIdHex(chainId) {
  return `0x${Number(chainId).toString(16)}`;
}
