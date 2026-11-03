import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { abrirBancoDeTeste } from "../fixtures/banco.js";
import { inicializarBanco } from "../../../api/src/banco/inicializar.js";
import { importarInmet } from "../../../api/src/banco/importarInmet.js";
import { hashDaSerie } from "../../../api/src/dominio/reproducao.js";
const require = createRequire(new URL("../../../oraculo/package.json", import.meta.url));
const { conferirSerie } = require("./src/serieHistorica.js");
const { avaliarHistorico } = require("./src/historico.js");

test("Pacote tratado é importado sem duplicação e aceito pela conferência do oráculo", async () => {
  const banco = await abrirBancoDeTeste();
  const pacote = fileURLToPath(new URL("../../../api/recursos/inmet/A770/", import.meta.url));
  try {
    await inicializarBanco(banco);
    assert.deepEqual(await importarInmet(banco, pacote), { anos: 5, dias: 1827 });
    assert.deepEqual(await importarInmet(banco, pacote), { anos: 0, dias: 0 });
    const inicio = "2024-01-01",
      fim = "2024-01-31";
    const { rows } = await banco.query(
      "SELECT data::text,chuva_mm,horas_validas FROM inmet_dias WHERE estacao='A770' AND data BETWEEN $1 AND $2 ORDER BY data",
      [inicio, fim],
    );
    const termos = {
      inicioHistorico: inicio,
      fimHistorico: fim,
      hashSerie: await hashDaSerie(banco, inicio, fim),
    };
    assert.doesNotThrow(() => conferirSerie(rows, termos, pacote));
    const resultado = avaliarHistorico({ linhas: rows, inicio, fim, gatilho: 30 });
    assert.equal(resultado.dias.length, 31);
    assert.equal(resultado.estacao, "A770");
    const adulteradas = rows.map((l, i) => (i ? l : { ...l, chuva_mm: Number(l.chuva_mm) + 1 }));
    assert.throws(() => conferirSerie(adulteradas, termos, pacote), /difere/);
  } finally {
    await banco.fechar();
  }
});
