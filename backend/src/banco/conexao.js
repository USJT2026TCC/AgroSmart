import { mkdirSync } from "node:fs";

import { config } from "../config.js";

/**
 * Conexao com o banco de dados.
 *
 * O iniciador da raiz fornece DATABASE_URL do PostgreSQL/PostGIS no Docker,
 * ou respeita servidor externo explicitamente configurado. PGlite permanece
 * para testes isolados e leitura do banco legado durante a transferencia local.
 * Ambos expõem query, executar, transacao e fechar; dados monetarios numericos
 * sao preservados como texto, sem conversao para ponto flutuante.
 */

/**
 * @typedef {object} Banco
 * @property {(sql: string, params?: any[]) => Promise<{rows: any[]}>} query
 * @property {(sql: string) => Promise<void>} executar Varias instrucoes, sem parametros.
 * @property {<T>(fn: (tx: {query: Banco["query"]}) => Promise<T>) => Promise<T>} transacao
 * @property {() => Promise<void>} fechar
 * @property {string} motor
 */

/** Abre o PostgreSQL embutido. `diretorio` nulo significa banco em memoria. */
export async function abrirPGlite(diretorio) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { postgis } = await import("@electric-sql/pglite-postgis");

  if (diretorio) mkdirSync(diretorio, { recursive: true });

  const db = await PGlite.create({
    dataDir: diretorio ?? undefined,
    extensions: { postgis },
  });

  // O PGlite informa as linhas afetadas em `affectedRows`; o driver `pg`, em
  // `rowCount`. Normaliza-se para o nome do `pg`, e o resto do codigo usa um so.
  const normalizar = (r) => ({
    ...r,
    rowCount: r.affectedRows ?? r.rows?.length ?? 0,
  });

  return {
    motor: diretorio ? "pglite" : "pglite-memoria",
    query: async (sql, params = []) => normalizar(await db.query(sql, params)),
    executar: async (sql) => {
      await db.exec(sql);
    },
    transacao: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async (sql, params = []) =>
            normalizar(await tx.query(sql, params)),
        }),
      ),
    fechar: () => db.close(),
  };
}

/** Abre um PostgreSQL de verdade pelo endereco informado. */
export async function abrirPostgres(url) {
  const { default: pg } = await import("pg");

  // Valores monetarios sao guardados em wei, como `numeric(78,0)`, e o driver
  // devolve `numeric` como texto. E o que se quer: wei nao cabe em Number, e o
  // texto e convertido para BigInt no dominio, sem perda.
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 10000,
  });

  return {
    motor: "postgres",
    query: (sql, params = []) => pool.query(sql, params),
    executar: async (sql) => {
      await pool.query(sql);
    },
    transacao: async (fn) => {
      const cliente = await pool.connect();

      try {
        await cliente.query("BEGIN");
        const resultado = await fn({
          query: (sql, params = []) => cliente.query(sql, params),
        });
        await cliente.query("COMMIT");

        return resultado;
      } catch (erro) {
        await cliente.query("ROLLBACK");
        throw erro;
      } finally {
        cliente.release();
      }
    },
    fechar: () => pool.end(),
  };
}

/**
 * Abre o banco conforme a configuracao.
 *
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.emMemoria] Banco descartavel, usado pelos testes.
 * @returns {Promise<Banco>}
 */
export async function abrirBanco(opcoes = {}) {
  if (opcoes.emMemoria) return abrirPGlite(null);
  if (config.urlDoBanco) return abrirPostgres(config.urlDoBanco);

  return abrirPGlite(config.dirBanco);
}
