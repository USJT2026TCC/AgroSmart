const { expect } = require("chai");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { montarTermos, cenarioApoliceAtiva, ModoPagamento } = require("./helpers");

/**
 * Teste de equivalencia entre a regra do contrato e a regra do aplicativo.
 *
 * O aplicativo reimplementa `_percentualDevido` em JavaScript, porque a tela de
 * cotacao precisa mostrar ao produtor o que aciona e o que nao aciona o pagamento
 * antes de existir qualquer contrato implantado para consultar (RNF04, e o
 * criterio de aceite 2 da HU10).
 *
 * Duas implementacoes da mesma regra divergem com o tempo — e a divergencia aqui
 * seria grave, porque o produtor aceitaria a apolice com base num numero que o
 * contrato nao vai honrar. Este teste compara as duas, caso a caso, de modo que
 * mexer em um dos lados sem mexer no outro quebre a suite.
 *
 * O arquivo do aplicativo e um modulo ESM e este projeto e CommonJS, dai o
 * `import()` dinamico.
 */
describe("Equivalencia entre a regra do contrato e a do aplicativo", function () {
  let regra;

  before(async function () {
    const arquivo = path.join(__dirname, "..", "..", "app", "src", "cadeia", "regraDeGatilho.js");
    regra = await import(pathToFileURL(arquivo).href);
  });

  /** Pontos escolhidos em torno dos limiares, onde a divergencia apareceria. */
  const CLIMAS = [0, 1, 29, 30, 31, 44, 45, 46, 59, 60, 61, 80, 1000];

  /**
   * Compara as duas implementacoes em todos os indices.
   * @param {object} termos Termos da apolice, ja com produtor e registry.
   */
  async function conferirEquivalencia(apolice, termos) {
    for (const clima of CLIMAS) {
      const doContrato = await apolice.simularPercentual(clima);
      const doAplicativo = regra.percentualDevido(termos, clima);

      expect(Number(doContrato)).to.equal(doAplicativo, `divergencia em clima=${clima}`);
    }
  }

  const CONFIGURACOES = [
    {
      nome: "pagamento integral",
      termos: { modoPagamento: ModoPagamento.INTEGRAL },
    },
    {
      nome: "pagamento integral com gatilho alternativo",
      termos: {
        modoPagamento: ModoPagamento.INTEGRAL,
        limiarClimatico: 45,
        limiarClimaticoIntegral: 0,
      },
    },
  ];

  for (const configuracao of CONFIGURACOES) {
    it(`concorda com o contrato: ${configuracao.nome}`, async function () {
      const { apolice, termos } = await cenarioApoliceAtiva(configuracao.termos);

      await conferirEquivalencia(apolice, termos);
    });
  }

  it("o valor devido em wei tambem bate com o limite contratado", async function () {
    const { apolice, termos } = await cenarioApoliceAtiva({
      modoPagamento: ModoPagamento.INTEGRAL,
      limiarClimatico: 30,
      limiarClimaticoIntegral: 0,
    });

    for (const clima of [30, 45, 60, 90]) {
      const percentual = BigInt(await apolice.simularPercentual(clima));
      const esperado = (BigInt(termos.valorIndenizacao) * percentual) / 10_000n;

      expect(regra.valorDevido(termos, clima)).to.equal(esperado);
    }
  });

  it("os exemplos mostrados na cotacao sao calculados pela mesma regra", async function () {
    const termos = await montarTermos({
      modoPagamento: ModoPagamento.INTEGRAL,
      limiarClimatico: 30,
      limiarClimaticoIntegral: 0,
    });

    const exemplos = regra.exemplosDeAcionamento(termos);

    // Precisa haver ao menos um exemplo que nao aciona e um que paga integral,
    // senao a tela nao cumpre o que o RNF04 pede.
    expect(exemplos.some((e) => e.percentualBps === 0)).to.equal(true);
    expect(exemplos.some((e) => e.percentualBps === 10_000)).to.equal(true);

    for (const exemplo of exemplos) {
      expect(regra.percentualDevido(termos, exemplo.diasSemChuva)).to.equal(exemplo.percentualBps);
    }
  });
});
