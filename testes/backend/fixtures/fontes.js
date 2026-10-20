import { ethers } from "ethers";
import { FONTES_DE_DEMONSTRACAO as fontes } from "../../../backend/src/banco/semente.js";
const frase = "test test test test test test test test test test test junk";
export function carteiraDeFonteDeDemonstracao(indice) {
  return ethers.HDNodeWallet.fromPhrase(
    frase,
    undefined,
    `m/44'/60'/0'/0/${indice}`,
  );
}
export const FONTES_DE_DEMONSTRACAO = fontes.map((f, i) => ({
  ...f,
  indice: i + 10,
}));
