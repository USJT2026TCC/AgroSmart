import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { montar, entrar, com } from "./ajuda.js";
import { importarInmet } from "../../../api/src/banco/importarInmet.js";

test("importacao persistida e idempotente; API avalia periodo e proposta congela gatilho", async () => {
  const ctx = await montar();
  const dir = mkdtempSync(join(tmpdir(), "agrosmart-inmet-"));
  try {
    const original = "fixture sintetica: nao e medicao real";
    const diario =
      "data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas\n2024-02-07,0,24,0,0\n2024-02-08,0,24,0,0\n2024-02-09,,0,24,0\n";
    const hash = (s) => createHash("sha256").update(s).digest("hex");
    writeFileSync(join(dir, "2024-original.csv"), original);
    writeFileSync(join(dir, "2024-diario.csv"), diario);
    writeFileSync(
      join(dir, "manifesto.json"),
      JSON.stringify({
        versao: 1,
        estacao: "A770",
        anos: {
          2024: {
            status: "preparado",
            inicio: "2024-01-01",
            fim: "2024-12-31",
            sha256Original: hash(original),
            sha256Diario: hash(diario),
          },
        },
      }),
    );
    assert.deepEqual(await importarInmet(ctx.banco, dir), { anos: 1, dias: 3 });
    assert.deepEqual(await importarInmet(ctx.banco, dir), { anos: 0, dias: 0 });
    assert.equal(
      (await ctx.api().post("/api/historico/avaliar").send({})).status,
      401,
    );
    for (const [inicio, fim] of [
      ["2019-12-31", "2020-01-01"],
      ["2026-09-30", "2026-10-01"],
    ]) {
      const token = await entrar(ctx.api, "produtor");
      const fora = await ctx
        .api()
        .post("/api/historico/avaliar")
        .set(com(token))
        .send({ inicio, fim, gatilho: 1 });
      assert.equal(fora.status, 400);
    }
    await assert.rejects(
      () =>
        ctx.banco.query(
          "INSERT INTO inmet_dias(estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas) VALUES ('A770','2026-10-01',0,24,0,0)",
        ),
      /inmet_recorte_historico/,
    );
    const produtor = await entrar(ctx.api, "produtor");
    const resultado = await ctx
      .api()
      .post("/api/historico/avaliar")
      .set(com(produtor))
      .send({ inicio: "2024-02-07", fim: "2024-02-09", gatilho: 2 });
    assert.equal(resultado.status, 200);
    assert.equal(resultado.body.resultado.primeiroAcionamento, "2024-02-08");
    assert.equal(resultado.body.resultado.diasIncompletos, 1);
    const talhao = (
      await ctx.api().get("/api/talhoes").set(com(produtor))
    ).body.talhoes.find((t) => t.cultura === "soja");
    const produto = (
      await ctx.api().get("/api/produtos").set(com(produtor))
    ).body.produtos.find((p) => p.cultura === "soja");
    const corpo = {
      talhaoId: talhao.id,
      produtoId: produto.id,
      areaHa: "1",
      reproducaoHistorica: true,
      inicioDaVigencia: "2024-02-07",
      fimDaVigencia: "2024-02-08",
      gatilhoDias: 2,
    };
    const proposta = await ctx
      .api()
      .post("/api/propostas")
      .set(com(produtor))
      .send(corpo);
    assert.equal(proposta.status, 201, JSON.stringify(proposta.body));
    assert.equal(proposta.body.proposta.termos.limiarClimatico, 2);
    const seguradora = await entrar(ctx.api, "seguradora");
    const preparada = await ctx
      .api()
      .post(`/api/propostas/${proposta.body.proposta.id}/preparar`)
      .set(com(seguradora))
      .send({});
    assert.equal(preparada.status, 200, JSON.stringify(preparada.body));
    assert.equal(preparada.body.modoHistorico, true);
    ctx.cadeia.suportaHistorico = () => false;
    const bloqueada = await ctx
      .api()
      .post(`/api/propostas/${proposta.body.proposta.id}/preparar`)
      .set(com(seguradora))
      .send({});
    assert.equal(bloqueada.status, 409);
    assert.match(bloqueada.body.erro.mensagem, /ainda nao suporta/);
    delete ctx.cadeia.suportaHistorico;

    assert.equal(
      preparada.body.termos.vigenciaInicio,
      Date.parse("2024-02-07T00:00:00Z") / 1000,
    );
    assert.match(
      preparada.body.descricaoDosTermos,
      /contagem:inicio-da-cobertura/,
    );
    const invalida = await ctx
      .api()
      .post("/api/propostas")
      .set(com(produtor))
      .send({ ...corpo, gatilhoDias: 0 });
    assert.equal(invalida.status, 400);
    const incompleta = await ctx
      .api()
      .post("/api/propostas")
      .set(com(produtor))
      .send({ ...corpo, fimDaVigencia: "2024-02-09" });
    assert.equal(incompleta.status, 400);
    assert.match(incompleta.body.erro.mensagem, /dias incompletos/);
    writeFileSync(join(dir, "2024-diario.csv"), diario + "adulterado");
    await ctx.banco.query("DELETE FROM inmet_arquivos");
    await assert.rejects(() => importarInmet(ctx.banco, dir), /SHA-256/);
  } finally {
    await ctx.fechar();
    rmSync(dir, { recursive: true, force: true });
  }
});
