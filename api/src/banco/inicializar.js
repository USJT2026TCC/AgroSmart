import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
      "auditoria",
      "inmet_arquivos",
      "inmet_dias",
    ];
    const { rows: tabelas } = await banco.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    const presentes = new Set(tabelas.map((t) => t.tablename));
    if (esperadas.some((t) => !presentes.has(t)))
      throw new Error("Banco incompleto: confira o esquema atual antes de iniciar.");
    await banco.executar(`ALTER TABLE talhoes ALTER COLUMN geometria DROP NOT NULL;
      ALTER TABLE talhoes ADD COLUMN IF NOT EXISTS origem_area text NOT NULL DEFAULT 'poligono'
        CHECK (origem_area IN ('poligono', 'informada'));`);
    return [];
  }
  const sql = readFileSync(new URL("./esquema.sql", import.meta.url), "utf8");
  await banco.executar(`BEGIN; ${sql} COMMIT;`);
  return ["esquema.sql"];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { abrirBanco } = await import("./conexao.js");
  const banco = await abrirBanco();
  try {
    console.log(await inicializarBanco(banco));
  } finally {
    await banco.fechar();
  }
}
