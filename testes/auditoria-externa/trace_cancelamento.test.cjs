const { ethers, network } = require("hardhat");
const VALOR = ethers.parseEther("0.006");
const ts = (s) => Math.floor(Date.parse(s + "T00:00:00Z") / 1000);
const b32 = ethers.encodeBytes32String;
describe("trace cancelamento", function () {
  it("compara gravacoes de armazenamento em C1 e C2", async () => {
    const [seg, ora, prod] = await ethers.getSigners();
    const R = await ethers.getContractFactory("OracleRegistry"); const registry = await R.connect(seg).deploy(seg.address);
    await registry.connect(seg).autorizar(ora.address);
    const F = await ethers.getContractFactory("ApoliceFactory"); const factory = await F.connect(seg).deploy(await registry.getAddress(), seg.address);
    const A = await ethers.getContractFactory("ApoliceHistorica");
    const t = { produtor: prod.address, registry: ethers.ZeroAddress, cultura: b32("soja"), talhao: b32("talhao-x"), limiarClimatico: 10,
      vigenciaInicio: ts("2024-06-01"), vigenciaFim: ts("2024-06-30") + 86399, valorIndenizacao: VALOR, hashTermos: ethers.keccak256("0x01") };
    async function emitir() { const r = await (await factory.connect(seg).emitirApoliceHistorica(t)).wait();
      const ev = r.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "ApoliceEmitida");
      return A.attach(ev.args.apolice); }
    async function slots(addr) { const o = []; for (let i = 0; i < 12; i++) o.push(await ethers.provider.getStorage(addr, i)); return o; }
    async function sstores(hash) {
      const tr = await network.provider.send("debug_traceTransaction", [hash, { disableStorage: true, disableMemory: true }]);
      return tr.structLogs.filter((s) => s.op === "SSTORE").map((s) => ({ slot: BigInt("0x" + s.stack[s.stack.length - 1]).toString(), valor: BigInt("0x" + s.stack[s.stack.length - 2]).toString() }));
    }
    for (const [rot, dep] of [["C1 sem garantia", false], ["C2 com garantia", true]]) {
      const a = await emitir(); const addr = await a.getAddress();
      if (dep) await (await a.connect(seg).depositarGarantia({ value: VALOR })).wait();
      const antes = await slots(addr);
      const tx = await a.connect(seg).cancelar(); const r = await tx.wait();
      const depois = await slots(addr);
      const mud = antes.map((v, i) => [i, v, depois[i]]).filter(([, v, w]) => v !== w).map(([i, v, w]) => `slot ${i}: ${BigInt(v)} -> ${BigInt(w)}`);
      console.log(rot, "| gas local:", Number(r.gasUsed), "| SSTOREs:", JSON.stringify(await sstores(tx.hash)), "| slots alterados:", mud.join("; "));
    }
  });
});
