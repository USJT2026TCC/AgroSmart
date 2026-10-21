import { vi } from "vitest";
/**
 * Preparacao comum dos testes das telas.
 *
 * Testing Library desmonta cada tela ao fim do teste; o jest-dom nao e usado,
 * as conferencias sao feitas com os seletores da propria Testing Library.
 */
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

vi.mock("../../interface/src/cadeia/rede.js", async (importOriginal) => {
  const original = await importOriginal();
  const rede = {
    chainId: 31337,
    nome: "Hardhat local",
    moeda: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpc: "http://127.0.0.1:8545",
    explorador: null,
  };
  return {
    ...original,
    REDES: { localhost: rede },
    REDE_ATIVA: "localhost",
    redeAtiva: () => ({ ...rede, chave: "localhost" }),
    linkDoExplorador: () => null,
  };
});
