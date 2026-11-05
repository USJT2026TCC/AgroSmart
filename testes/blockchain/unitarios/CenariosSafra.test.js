// Cenarios de safra em rede local: serie real da estacao A770, regra do oraculo e contrato real.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { ethers } = require("hardhat");
const { expect } = createRequire(path.resolve(__dirname, "../../../blockchain/package.json"))("chai");
const { avaliarHistorico } = require("../../../oraculo/src/historico.js");

const raiz = path.resolve(__dirname, "../../..");
const linhas = [];
for (let ano = 2020; ano <= 2024; ano++) {
  const texto = fs.readFileSync(path.join(raiz, `api/recursos/inmet/A770/${ano}-diario.csv`), "utf8");
  for (const r of texto.trim().split(/\r?\n/).slice(1)) {
    const [data, chuva_mm, horas] = r.split(",");
    linhas.push({ data, chuva_mm, horas_validas: Number(horas) });
  }
}

const CENARIOS = [
  { id: "S1", inicio: "2022-02-01", fim: "2022-02-28", gatilho: 10, paga: true },
  { id: "S2", inicio: "2022-11-01", fim: "2022-11-30", gatilho: 15, paga: true },
  { id: "S3", inicio: "2024-02-20", fim: "2024-03-31", gatilho: 10, paga: false },
  { id: "S4", inicio: "2024-02-20", fim: "2024-03-31", gatilho: 9, paga: true },
];
const seg = (d, h = "00:00:00") => BigInt(Date.parse(`${d}T${h}Z`) / 1000);
const VALOR = ethers.parseEther("0.006");

describe("Cenarios de safra em rede local", () => {
  for (const c of CENARIOS) {
    it(`${c.id}: ${c.inicio} a ${c.fim}, gatilho ${c.gatilho}`, async () => {
      const [seguradora, produtor, oraculo] = await ethers.getSigners();
      const serie = linhas.filter((l) => l.data >= c.inicio && l.data <= c.fim);
      const r = avaliarHistorico({ linhas: serie, inicio: c.inicio, fim: c.fim, gatilho: c.gatilho });
      const registro = await ethers.deployContract("OracleRegistry", [seguradora.address]);
      await registro.autorizar(oraculo.address);
      const apolice = await ethers.deployContract("ApoliceHistorica", [
        seguradora.address,
        {
          produtor: produtor.address,
          registry: await registro.getAddress(),
          cultura: ethers.encodeBytes32String("soja"),
          talhao: ethers.encodeBytes32String("talhao-safra"),
          limiarClimatico: c.gatilho,
          vigenciaInicio: seg(c.inicio),
          vigenciaFim: seg(c.fim, "23:59:59"),
          valorIndenizacao: VALOR,
          hashTermos: ethers.id(`${c.id}|${c.inicio}|${c.fim}|${c.gatilho}`),
        },
      ]);
      await apolice.depositarGarantia({ value: VALOR });
      const dia = r.primeiroAcionamento || c.fim;
      const indice = r.dias.find((d) => d.data === dia).indiceClimatico;
      const periodo = Number(dia.replaceAll("-", ""));
      await apolice.connect(oraculo).publicarIndices(periodo, indice);
      if (c.paga) await apolice.connect(produtor).sacarIndenizacao();
      const pago = await apolice.valorPago();
      let situacaoFinal = Number(await apolice.situacao());
      if (!c.paga) {
        await apolice.resgatarGarantia();
        situacaoFinal = Number(await apolice.situacao());
      }
      console.log(
        `RESULTADO ${c.id} cobertura=${c.inicio}..${c.fim} G=${c.gatilho} maiorSeq=${r.maiorSequencia} dia=${dia} indice=${indice} pago=${ethers.formatEther(pago)} situacao=${situacaoFinal} saldo=${await ethers.provider.getBalance(await apolice.getAddress())}`,
      );
      expect(pago).to.equal(c.paga ? VALOR : 0n);
      expect(situacaoFinal).to.equal(c.paga ? 2 : 3);
    });
  }
});
