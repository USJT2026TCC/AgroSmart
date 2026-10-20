import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { executar, raiz } from "../../scripts/processos.mjs";
import { abrirBanco, abrirPostgres } from "../../backend/src/banco/conexao.js";
import { migrar } from "../../backend/src/banco/migrar.js";
import { importarInmet } from "../../backend/src/banco/importarInmet.js";
import { transferirDados } from "../../backend/src/banco/transferirLegado.js";
import { semearParaTeste } from "../backend/fixtures/semente.js";

test(
  "PostgreSQL/PostGIS real: preserva legado, importa pacote e reutiliza banco",
  // Inclui o primeiro download da imagem; execucoes com cache sao mais rapidas.
  { timeout: 1800000 },
  async () => {
    const porta = await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const n = s.address().port;
        s.close(() => resolve(n));
      });
    });
    const projeto = `agrosmart-teste-${process.pid}`;
    const arquivo = path.join(raiz, "testes/configuracao/docker-compose.yml");
    const env = { ...process.env, PORTA_POSTGRES_TESTE: String(porta) };
    const argumentos = [
      "compose",
      "--project-name",
      projeto,
      "--file",
      arquivo,
    ];
    const url = `postgresql://fixture:fixture_apenas_teste@127.0.0.1:${porta}/fixture`;
    let iniciado = false,
      origem,
      banco;
    try {
      await executar("docker", ["compose", "version"], { cwd: raiz, env });
      iniciado = true;
      await executar(
        "docker",
        [...argumentos, "up", "--detach", "--wait", "--wait-timeout", "120"],
        { cwd: raiz, env },
      );
      origem = await abrirBanco({ emMemoria: true });
      banco = await abrirPostgres(url);
      await migrar(origem);
      await migrar(banco);
      await semearParaTeste(origem);
      await origem.query(
        "INSERT INTO auditoria(acao,instante) VALUES ('fixture','2024-02-07T12:34:56.123456Z')",
      );
      const identidades = (
        await origem.query(
          "SELECT id,carteira,hash_senha FROM usuarios ORDER BY identificador",
        )
      ).rows;
      const geometrias = (
        await origem.query(
          "SELECT identificador,ST_AsEWKT(geometria) AS geometria FROM talhoes ORDER BY identificador",
        )
      ).rows;
      assert.equal(
        (await transferirDados(origem, banco, "fixture-docker")).transferida,
        true,
      );
      assert.deepEqual(
        (
          await banco.query(
            "SELECT id,carteira,hash_senha FROM usuarios ORDER BY identificador",
          )
        ).rows,
        identidades,
      );
      assert.deepEqual(
        (
          await banco.query(
            "SELECT identificador,ST_AsEWKT(geometria) AS geometria FROM talhoes ORDER BY identificador",
          )
        ).rows,
        geometrias,
      );
      assert.equal(
        (
          await banco.query(
            "SELECT instante::text AS valor FROM auditoria WHERE acao='fixture'",
          )
        ).rows[0].valor,
        "2024-02-07 12:34:56.123456+00",
      );
      assert.deepEqual(await importarInmet(banco), { anos: 7, dias: 2465 });
      await banco.fechar();
      banco = await abrirPostgres(url);
      assert.deepEqual(await importarInmet(banco), { anos: 0, dias: 0 });
      assert.equal(
        (await transferirDados(origem, banco, "fixture-docker")).transferida,
        false,
      );
    } finally {
      await banco?.fechar();
      await origem?.fechar();
      // Somente projeto e volume de teste deste processo. Nunca usa o Compose de uso.
      if (
        iniciado &&
        /^agrosmart-teste-\d+$/.test(projeto) &&
        arquivo === path.join(raiz, "testes/configuracao/docker-compose.yml")
      )
        await executar("docker", [...argumentos, "down", "--volumes"], {
          cwd: raiz,
          env,
        });
    }
  },
);
