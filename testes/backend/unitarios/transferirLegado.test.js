import assert from "node:assert/strict";
import { test } from "node:test";
import { abrirBanco } from "../../../backend/src/banco/conexao.js";
import { migrar } from "../../../backend/src/banco/migrar.js";
import { semearParaTeste } from "../fixtures/semente.js";
import { transferirDados } from "../../../backend/src/banco/transferirLegado.js";
import { importarInmet } from "../../../backend/src/banco/importarInmet.js";

test("transicao preserva identidade, geometria, valores e sequencias; nao mistura nem duplica", async () => {
  const origem = await abrirBanco({ emMemoria: true }),
    destino = await abrirBanco({ emMemoria: true });
  try {
    await migrar(origem);
    await migrar(destino);
    await semearParaTeste(origem);
    const a = (
      await origem.query(
        "SELECT id,carteira,hash_senha FROM usuarios ORDER BY identificador",
      )
    ).rows;
    const geo = (
      await origem.query(
        "SELECT identificador,ST_AsEWKT(geometria) AS geo,area_ha::text FROM talhoes ORDER BY identificador",
      )
    ).rows;
    await origem.query(
      "INSERT INTO notificacoes(usuario_id,tipo,titulo,mensagem) VALUES ($1,'fixture','Fixture','Dados sinteticos')",
      [a[0].id],
    );
    const copia = await transferirDados(origem, destino, "fixture-origem");
    assert.equal(copia.transferida, true);
    assert.deepEqual(
      (
        await destino.query(
          "SELECT id,carteira,hash_senha FROM usuarios ORDER BY identificador",
        )
      ).rows,
      a,
    );
    assert.deepEqual(
      (
        await destino.query(
          "SELECT identificador,ST_AsEWKT(geometria) AS geo,area_ha::text FROM talhoes ORDER BY identificador",
        )
      ).rows,
      geo,
    );
    assert.equal(
      (await transferirDados(origem, destino, "fixture-origem")).transferida,
      false,
    );
    await assert.rejects(
      () => transferirDados(origem, destino, "outra-origem"),
      /ja contem dados/,
    );
    const nova = await destino.query(
      "INSERT INTO notificacoes(usuario_id,tipo,titulo,mensagem) VALUES ($1,'fixture','Outra','Fixture') RETURNING id",
      [a[0].id],
    );
    assert.equal(Number(nova.rows[0].id), 2);
    assert.equal(
      (await origem.query("SELECT count(*)::int AS n FROM notificacoes"))
        .rows[0].n,
      1,
    );
  } finally {
    await origem.fechar();
    await destino.fechar();
  }
});

test("pacote publico inicializa banco vazio e segunda carga e vazia", async () => {
  const banco = await abrirBanco({ emMemoria: true });
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
