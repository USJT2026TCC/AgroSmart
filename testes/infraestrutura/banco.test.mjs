import { test } from "node:test";
import assert from "node:assert/strict";
import { configuracaoDoBanco, iniciarBanco } from "../../scripts/banco.mjs";

test("padrao usa PostgreSQL local com credenciais codificadas", () => {
  const c = configuracaoDoBanco({ POSTGRES_PASSWORD: "p@ss:word" });
  assert.equal(c.docker, true);
  assert.match(c.url, /p%40ss%3Aword@127.0.0.1:5433/);
  assert.throws(() => configuracaoDoBanco({ POSTGRES_PORT: "invalida" }));
});
test("Docker aguarda saude e nunca remove volumes", async () => {
  const chamadas = [];
  await iniciarBanco(configuracaoDoBanco({}), async (cmd, args) => {
    chamadas.push([cmd, args]);
  });
  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[0], ["docker", ["compose", "version"]]);
  assert.ok(chamadas[1][1].includes("--wait"));
  assert.ok(chamadas[1][1].includes("banco"));
  assert.ok(!chamadas.flat(2).some((s) => s === "down" || s === "--volumes"));
});
test("banco externo respeita DATABASE_URL e nao inicia Docker", async () => {
  const config = configuracaoDoBanco({ DATABASE_URL: "postgresql://fixture" });
  await iniciarBanco(config, async () => {
    throw new Error("Nao deveria executar");
  });
  assert.equal(config.url, "postgresql://fixture");
});
test("sem Docker, falha claramente sem criar banco alternativo", async () => {
  await assert.rejects(
    () =>
      iniciarBanco(configuracaoDoBanco({}), async () => {
        throw Object.assign(new Error("nao encontrado"), { code: "ENOENT" });
      }),
    /Docker nao encontrado/,
  );
});

// Sem URL, uma execucao direta nao pode recriar o banco persistente antigo.
test("backend sem URL recusa banco persistente alternativo", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const resultado = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from "node:assert/strict";
    import { abrirBanco } from "./api/src/banco/conexao.js";
    await assert.rejects(() => abrirBanco(), /DATABASE_URL obrigatoria/);
  `,
    ],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, DATABASE_URL: "" },
      encoding: "utf8",
    },
  );
  assert.equal(resultado.status, 0, resultado.stderr);
});
