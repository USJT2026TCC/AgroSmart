import assert from "node:assert/strict";
import { test } from "node:test";
import { abrirBancoDeTeste } from "../fixtures/banco.js";
import { migrar } from "../../../backend/src/banco/migrar.js";
import { importarInmet } from "../../../backend/src/banco/importarInmet.js";

test("pacote publico inicializa banco vazio e segunda carga e vazia", async () => {
  const banco = await abrirBancoDeTeste();
  try {
    await migrar(banco);
    assert.deepEqual(await importarInmet(banco), { anos: 7, dias: 2465 });
    assert.deepEqual(await importarInmet(banco), { anos: 0, dias: 0 });
    assert.equal(
      (await banco.query("SELECT count(*)::int AS n FROM usuarios")).rows[0].n,
      0,
    );
    assert.equal(
      (await banco.query("SELECT count(*)::int AS n FROM inmet_arquivos"))
        .rows[0].n,
      7,
    );
  } finally {
    await banco.fechar();
  }
});
