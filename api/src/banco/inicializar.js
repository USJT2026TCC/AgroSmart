import { readFileSync } from "node:fs";

/** Inicializa o esquema atual e mantém o recorte das novas gravações. */
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
    // Restringe novas gravações sem apagar registros climáticos anteriores.
    // NOT VALID preserva registros antigos; validar quando todos estão no recorte.
    await banco.transacao(async (tx) => {
      await tx.query(`ALTER TABLE inmet_arquivos
        DROP CONSTRAINT IF EXISTS inmet_anos_historicos,
        ADD CONSTRAINT inmet_anos_historicos
          CHECK (estacao='A770' AND ano BETWEEN 2020 AND 2024) NOT VALID`);
      await tx.query(`ALTER TABLE inmet_dias
        DROP CONSTRAINT IF EXISTS inmet_recorte_historico,
        ADD CONSTRAINT inmet_recorte_historico
          CHECK (estacao='A770' AND data BETWEEN DATE '2020-01-01' AND DATE '2024-12-31') NOT VALID`);
      const { rows: fora } = await tx.query(`SELECT
        EXISTS(SELECT 1 FROM inmet_arquivos WHERE estacao<>'A770' OR ano NOT BETWEEN 2020 AND 2024) AS arquivos,
        EXISTS(SELECT 1 FROM inmet_dias WHERE estacao<>'A770' OR data NOT BETWEEN DATE '2020-01-01' AND DATE '2024-12-31') AS dias`);
      if (!fora[0].arquivos)
        await tx.query("ALTER TABLE inmet_arquivos VALIDATE CONSTRAINT inmet_anos_historicos");
      if (!fora[0].dias)
        await tx.query("ALTER TABLE inmet_dias VALIDATE CONSTRAINT inmet_recorte_historico");
    });
    return [];
  }
  const sql = readFileSync(new URL("./esquema.sql", import.meta.url), "utf8");
  await banco.executar(`BEGIN; ${sql} COMMIT;`);
  return ["esquema.sql"];
}
