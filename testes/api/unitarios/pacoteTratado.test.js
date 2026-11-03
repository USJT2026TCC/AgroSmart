import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { montar, entrar, com } from "./ajuda.js";
import { importarInmet } from "../../../api/src/banco/importarInmet.js";
import { hashDaSerie } from "../../../api/src/dominio/reproducao.js";
const require = createRequire(import.meta.url);
const { conferirSerie } = require("../../../oraculo/src/serieHistorica.js");

test("pacote tratado importa sem migracao, cota e passa na verificacao do oraculo", async () => {
  const ctx = await montar();
  try {
    assert.deepEqual(await importarInmet(ctx.banco), { anos: 5, dias: 1827 });
    assert.deepEqual(await importarInmet(ctx.banco), { anos: 0, dias: 0 });
    const { rows: contagens } = await ctx.banco.query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE horas_validas<20 OR chuva_mm IS NULL)::int AS ruins FROM inmet_dias`);
    assert.deepEqual(contagens[0], { total: 1827, ruins: 0 });
    const { rows: linhas } = await ctx.banco.query(`SELECT data::text,chuva_mm,horas_validas
      FROM inmet_dias WHERE data BETWEEN '2021-01-01' AND '2021-01-05' ORDER BY data`);
    assert.ok(
      linhas.slice(0, 4).every((l) => Number(l.chuva_mm) === 12.6 && l.horas_validas >= 20),
    );
    const termos = {
      inicioHistorico: "2021-01-01",
      fimHistorico: "2021-01-05",
      hashSerie: await hashDaSerie(ctx.banco, "2021-01-01", "2021-01-05"),
    };
    assert.doesNotThrow(() => conferirSerie(linhas, termos));
    assert.throws(
      () => conferirSerie([{ ...linhas[0], chuva_mm: 999 }, ...linhas.slice(1)], termos),
      /difere do pacote/,
    );
    const produtor = await entrar(ctx.api, "produtor");
    const {
      body: { talhoes },
    } = await ctx.api().get("/api/talhoes").set(com(produtor));
    const {
      body: { produtos },
    } = await ctx.api().get("/api/produtos").set(com(produtor));
    const c = await ctx
      .api()
      .post("/api/cotacoes")
      .set(com(produtor))
      .send({
        talhaoId: talhoes[0].id,
        produtoId: produtos[0].id,
        inicioDaVigencia: "2021-01-01",
        fimDaVigencia: "2021-12-31",
        gatilhoDias: 30,
      });
    assert.equal(c.status, 200, JSON.stringify(c.body));
  } finally {
    await ctx.fechar();
  }
});
