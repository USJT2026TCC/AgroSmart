import { readFileSync } from "node:fs";

/** Inicializa somente o esquema atual; nao executa fluxos de versoes antigas. */
export async function inicializarBanco(banco) {
  const { rows } = await banco.query("SELECT to_regclass('public.usuarios') AS tabela");
  if (rows[0].tabela) {
    const esperadas = [
      "usuarios",
      "sessoes",
      "desafios_carteira",
      "propriedades",
      "talhoes",
      "produtos",
      "propostas",
      "apolices",
      "eventos_cadeia",
      "estado_indexador",
      "publicacoes_oraculo",
      "notificacoes",
      "inmet_arquivos",
      "inmet_dias",
    ];
    const { rows: tabelas } = await banco.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    const presentes = new Set(tabelas.map((t) => t.tablename));
    if (esperadas.some((t) => !presentes.has(t)))
      throw new Error("Banco incompleto: confira o esquema atual antes de iniciar.");
    return [];
  }
  const sql = readFileSync(new URL("./esquema.sql", import.meta.url), "utf8");
  await banco.executar(`BEGIN; ${sql} COMMIT;`);
  return ["esquema.sql"];
}
