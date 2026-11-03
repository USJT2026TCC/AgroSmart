import { test } from "node:test";
import assert from "node:assert/strict";
import { montar } from "./ajuda.js";
import { inicializarBanco } from "../../../api/src/banco/inicializar.js";
const inserirDia = (b, data) =>
  b.query(
    "INSERT INTO inmet_dias(estacao,data,chuva_mm,horas_validas,horas_ausentes,horas_invalidas) VALUES ('A770',$1,0,24,0,0)",
    [data],
  );
const inserirAno = (b, ano) =>
  b.query(
    "INSERT INTO inmet_arquivos(estacao,ano,sha256_original,sha256_diario,procedencia) VALUES ('A770',$1,$2,$2,'{}')",
    [ano, "0".repeat(64)],
  );

test("esquema aceita limites inclusivos e rejeita dia e ano seguintes", async () => {
  const c = await montar();
  try {
    await inserirDia(c.banco, "2020-01-01");
    await inserirDia(c.banco, "2024-12-31");
    await assert.rejects(() => inserirDia(c.banco, "2025-01-01"), /inmet_recorte_historico/);
    await assert.rejects(() => inserirDia(c.banco, "2019-12-31"), /inmet_recorte_historico/);
    await inserirAno(c.banco, 2024);
    await assert.rejects(() => inserirAno(c.banco, 2025), /inmet_anos_historicos/);
  } finally {
    await c.fechar();
  }
});
test("reinicializacao restringe banco existente sem apagar dados anteriores", async () => {
  const c = await montar();
  try {
    await c.banco.query("ALTER TABLE inmet_dias DROP CONSTRAINT inmet_recorte_historico");
    await c.banco.query("ALTER TABLE inmet_arquivos DROP CONSTRAINT inmet_anos_historicos");
    await inserirDia(c.banco, "2025-01-01");
    await inserirAno(c.banco, 2025);
    const usuarios = (await c.banco.query("SELECT count(*)::int AS n FROM usuarios")).rows[0].n;
    await inicializarBanco(c.banco);
    await inicializarBanco(c.banco);
    assert.equal((await c.banco.query("SELECT count(*)::int AS n FROM inmet_dias")).rows[0].n, 1);
    assert.equal(
      (await c.banco.query("SELECT count(*)::int AS n FROM usuarios")).rows[0].n,
      usuarios,
    );
    await assert.rejects(() => inserirDia(c.banco, "2025-01-02"), /inmet_recorte_historico/);
    await assert.rejects(() => inserirAno(c.banco, 2026), /inmet_anos_historicos/);
  } finally {
    await c.fechar();
  }
});
test("banco compativel tem constraints validadas apos reinicializacao", async () => {
  const c = await montar();
  try {
    await inserirDia(c.banco, "2024-12-31");
    await inserirAno(c.banco, 2024);
    await inicializarBanco(c.banco);
    const { rows } = await c.banco.query(
      "SELECT convalidated FROM pg_constraint WHERE conname IN ('inmet_recorte_historico','inmet_anos_historicos')",
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.convalidated));
  } finally {
    await c.fechar();
  }
});
