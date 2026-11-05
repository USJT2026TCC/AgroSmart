import { beforeEach, expect, test, vi } from "vitest";
const estado = vi.hoisted(() => ({ contrato: null }));
vi.mock("ethers", async (original) => {
  const modulo = await original();
  return {
    ...modulo,
    ethers: {
      ...modulo.ethers,
      Contract: class {
        constructor() {
          return estado.contrato;
        }
      },
    },
  };
});
import { lerApolice } from "../../interface/src/cadeia/contratos.js";
import { emData } from "../../interface/src/cadeia/formatos.js";

beforeEach(() => {
  estado.contrato = {
    verTermos: async () => ({
      limiarClimatico: 30n,
      vigenciaInicio: 1707264000n,
      vigenciaFim: 1738972799n,
    }),
    situacao: async () => 1n,
    valorPago: async () => 0n,
    periodoAcionador: async () => 0n,
    garantiaRetida: async () => 6000000000000000n,
    totalPeriodos: async () => 0n,
    seguradora: async () => "0x0000000000000000000000000000000000000001",
    instanteHistorico: async () => 1707263999n,
    indenizacaoDisponivel: async () => 0n,
  };
});

test("apolice anterior ao saque, sem a funcao, le indenizacao disponivel zero", async () => {
  estado.contrato.indenizacaoDisponivel = async () => {
    throw new Error("could not decode result data");
  };
  const a = await lerApolice("0x0000000000000000000000000000000000000002", {});
  expect(a.indenizacaoDisponivel).toBe(0n);
});
test("le o relogio historico sem usar a data atual", async () => {
  const a = await lerApolice("0x0000000000000000000000000000000000000002", {});
  expect(a.instanteHistorico).toBe(1707263999);
  expect(a.termos.vigenciaInicio).toBe(1707264000);
});
test("datas da cobertura sao exibidas em UTC", () => {
  expect(emData(Date.parse("2024-02-07T00:00:00Z") / 1000)).toBe("07/02/2024");
  expect(emData(Date.parse("2025-02-07T23:59:59Z") / 1000)).toBe("07/02/2025");
});
