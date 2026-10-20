import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { abrirPGlite } from "./conexao.js";

const nomeSQL = (nome) => `"${nome.replaceAll('"', '""')}"`;
const IGNORADAS = new Set([
  "migracoes",
  "transferencias_banco",
  "spatial_ref_sys",
]);

/** Copia somente tabelas da aplicacao em uma unica transacao, sem apagar origem.
 * Destino precisa estar vazio. Nenhum dump com dados pessoais e criado no disco.
 * Geometrias sao transportadas em EWKB, JSON em texto e numericos sem Number.
 */
export async function transferirDados(origem, destino, chaveOrigem) {
  const { rows: marcas } = await destino.query(
    "SELECT 1 FROM transferencias_banco WHERE origem=$1",
    [chaveOrigem],
  );
  if (marcas.length) return { transferida: false, tabelas: {} };
  const { rows: lista } = await destino.query(
    `SELECT tablename AS nome FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  const tabelas = lista.map((l) => l.nome).filter((n) => !IGNORADAS.has(n));
  const { rows: disponiveis } = await origem.query(
    "SELECT tablename AS nome FROM pg_tables WHERE schemaname='public'",
  );
  const presentes = new Set(disponiveis.map((l) => l.nome));
  const { rows: relacoes } =
    await destino.query(`SELECT filha.relname AS filha,pai.relname AS pai FROM pg_constraint c
    JOIN pg_class filha ON filha.oid=c.conrelid JOIN pg_class pai ON pai.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=filha.relnamespace WHERE c.contype='f' AND n.nspname='public'`);
  const ordem = [],
    pendentes = new Set(tabelas);
  while (pendentes.size) {
    const prontas = [...pendentes].filter(
      (t) =>
        !relacoes.some(
          (r) => r.filha === t && r.pai !== t && pendentes.has(r.pai),
        ),
    );
    if (!prontas.length)
      throw new Error(
        "Dependencia ciclica: transferencia automatica recusada.",
      );
    for (const t of prontas) {
      ordem.push(t);
      pendentes.delete(t);
    }
  }
  const contagens = {};
  await destino.transacao(async (tx) => {
    // Recusa mistura com outra instalacao: nenhuma carteira ou usuario e sobrescrito.
    for (const tabela of tabelas) {
      const { rows } = await tx.query(
        `SELECT 1 FROM public.${nomeSQL(tabela)} LIMIT 1`,
      );
      if (rows.length)
        throw new Error(
          "PostgreSQL ja contem dados. Transferencia automatica recusada para nao misturar cadastros. Banco PGlite original preservado.",
        );
    }
    for (const tabela of ordem) {
      if (!presentes.has(tabela)) continue;
      const { rows: colunas } = await origem.query(
        `SELECT column_name AS nome,udt_name AS tipo,column_default AS padrao
        FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position`,
        [tabela],
      );
      const projecao = colunas
        .map((c) =>
          c.tipo === "geometry"
            ? `encode(ST_AsEWKB(${nomeSQL(c.nome)}),'hex') AS ${nomeSQL(c.nome)}`
            : nomeSQL(c.nome),
        )
        .join(",");
      const { rows } = await origem.query(
        `SELECT ${projecao} FROM public.${nomeSQL(tabela)}`,
      );
      const nomes = colunas.map((c) => nomeSQL(c.nome)).join(",");
      // Lotes limitam tamanho e preservam uma unica transacao de destino.
      for (let inicio = 0; inicio < rows.length; inicio += 100) {
        const valores = [];
        const tuplas = rows.slice(inicio, inicio + 100).map(
          (l) =>
            `(${colunas
              .map((c) => {
                let v = l[c.nome];
                if ((c.tipo === "json" || c.tipo === "jsonb") && v !== null)
                  v = JSON.stringify(v);
                if (c.tipo === "bytea" && v !== null) v = Buffer.from(v);
                valores.push(v);
                return c.tipo === "geometry"
                  ? `ST_GeomFromEWKB(decode($${valores.length},'hex'))`
                  : `$${valores.length}`;
              })
              .join(",")})`,
        );
        await tx.query(
          `INSERT INTO public.${nomeSQL(tabela)} (${nomes}) VALUES ${tuplas.join(",")}`,
          valores,
        );
      }
      for (const c of colunas.filter((c) => c.padrao?.includes("nextval("))) {
        const { rows: sequencias } = await tx.query(
          "SELECT pg_get_serial_sequence($1,$2) AS nome",
          [`public.${tabela}`, c.nome],
        );
        if (sequencias[0]?.nome) {
          const { rows: maximos } = await tx.query(
            `SELECT max(${nomeSQL(c.nome)})::text AS valor FROM public.${nomeSQL(tabela)}`,
          );
          await tx.query("SELECT setval($1::regclass,$2::bigint,$3)", [
            sequencias[0].nome,
            maximos[0].valor ?? "1",
            maximos[0].valor !== null,
          ]);
        }
      }
      contagens[tabela] = rows.length;
    }
    await tx.query(
      "INSERT INTO transferencias_banco(origem,tabelas) VALUES ($1,$2)",
      [chaveOrigem, JSON.stringify(contagens)],
    );
  });
  return { transferida: true, tabelas: contagens };
}

export async function transferirPGliteSeNecessario(destino, diretorio) {
  if (!diretorio || !existsSync(join(diretorio, "PG_VERSION")))
    return { transferida: false, tabelas: {} };
  const chave = createHash("sha256").update(diretorio).digest("hex");
  const { rows } = await destino.query(
    "SELECT 1 FROM transferencias_banco WHERE origem=$1",
    [chave],
  );
  if (rows.length) return { transferida: false, tabelas: {} };
  const origem = await abrirPGlite(diretorio);
  try {
    return await transferirDados(origem, destino, chave);
  } finally {
    await origem.fechar();
  }
}
