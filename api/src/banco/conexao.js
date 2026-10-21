import { config } from "../config.js";

/**
 * Conexao com o banco de dados.
 *
 * O iniciador da raiz fornece DATABASE_URL do PostgreSQL/PostGIS no Docker,
 * ou respeita servidor externo explicitamente configurado.
 * Expoe query, executar, transacao e fechar; dados monetarios numericos
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

  // No primeiro inicio do Docker, o Postgres temporario de inicializacao reinicia.
  // Aguarda a conexao TCP real; erro de senha ou SQL nao e ocultado por repeticao.
  try {
    for (let tentativa = 0; ; tentativa++) {
      try {
        await pool.query("SELECT 1");
        break;
      } catch (erro) {
        const transitorio =
          ["ECONNREFUSED", "ECONNRESET", "EPIPE", "57P03"].includes(erro.code) ||
          erro.message === "Connection terminated unexpectedly";
        if (!transitorio || tentativa >= 19) throw erro;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch (erro) {
    await pool.end();
    throw erro;
  }

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
 * @returns {Promise<Banco>}
 */
export async function abrirBanco() {
  if (config.urlDoBanco) return abrirPostgres(config.urlDoBanco);

  throw new Error(
    "DATABASE_URL obrigatoria. Inicie pela raiz com npm start para usar PostgreSQL/PostGIS no Docker.",
  );
}
