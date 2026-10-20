/** RNF08: cenarios hipoteticos usando gas local medido; nao e cotacao de mercado. */
const fs = require("node:fs");
const path = require("node:path");
const arquivo = path.join(
  __dirname,
  "../../evidencias/clima-integral-2026-10-16/gas-e-fluxo.json",
);
const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
if (dados.protocolo !== "clima-integral-v1")
  throw new Error("Medicao de outra versao.");
const g = Object.fromEntries(
  Object.entries(dados.gas).map(([k, v]) => [k, Number(v)]),
);
const limiteEth = 180 * 0.006;
const taxaPremio = 0.045;
const premioEth = limiteEth * taxaPremio;
const dias = 180;
console.log(
  "Hipoteses: 180 ha; 0,006 ETH/ha; taxa 4,5%; 180 dias. Gas medido em hardhat.",
);
console.log(
  "Pagamento somente na ultima publicacao; primeira publicacao sem pagamento usada como estimativa conservadora das demais.",
);
for (const cadencia of [1, 3]) {
  const publicacoes = Math.ceil(dias / cadencia);
  const gas =
    g.emissao +
    g.garantia +
    (publicacoes - 1) * g.publicacaoSemPagamento +
    g.publicacaoComPagamento;
  for (const precoHipoteticoGwei of [0.01, 0.5, 5]) {
    const custoEth = gas * precoHipoteticoGwei * 1e-9;
    const percentual = (custoEth / premioEth) * 100;
    console.log(
      JSON.stringify({
        cadenciaDias: cadencia,
        publicacoes,
        gas,
        precoHipoteticoGwei,
        custoEth,
        percentualDoPremio: percentual,
        atendeMetaDeUmPorCento: percentual <= 1,
      }),
    );
  }
}
console.log(
  "Cadencia maior exige avaliar risco de perder o gatilho entre publicacoes. Nao comprova viabilidade comercial ou custo de L2/Sepolia.",
);
