import { ethers } from "ethers";

import { gerarHashDeSenha } from "../seguranca/cripto.js";

/** Cadastros ficticios de demonstracao, inseridos somente no banco vazio. */

export async function semear(banco) {
  const { rows } = await banco.query("SELECT count(*)::int AS n FROM usuarios");
  if (rows[0].n > 0) return false;

  const senha = await gerarHashDeSenha("agrosmart");

  await banco.transacao(async (tx) => {
    const inserir = async (identificador, nome, perfil, documento, carteira = null) =>
      (
        await tx.query(
          `INSERT INTO usuarios (identificador, nome, perfil, documento, hash_senha, carteira,
                                 carteira_vinculada_em)
           VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END)
           RETURNING id`,
          [identificador, nome, perfil, documento, senha, carteira],
        )
      ).rows[0].id;

    // O produtor comprova a propria carteira por assinatura, inclusive na demonstracao.
    const produtor = await inserir(
      "produtor",
      "João Ribeiro",
      "produtor",
      "Fazenda Santa Clara — São Simão/SP",
      null,
    );
    await inserir(
      "seguradora",
      "Marina Costa",
      "seguradora",
      "AgroSeguro Mutua — mesa de subscricao",
    );

    const { rows: prop } = await tx.query(
      "INSERT INTO propriedades (produtor_id, nome, municipio) VALUES ($1, $2, $3) RETURNING id",
      [produtor, "Fazenda Santa Clara", "São Simão/SP"],
    );

    // Talhoes ficticios: a demonstracao assume coincidencia com a estacao A770.
    for (const [identificador, cultura, area] of [
      ["talhao-01", "soja", "180"],
      ["talhao-02", "soja", "100"],
    ]) {
      await tx.query(
        `INSERT INTO talhoes (propriedade_id, identificador, cultura, area_ha)
        VALUES ($1, $2, $3, $4)`,
        [prop[0].id, identificador, cultura, area],
      );
    }
    await tx.query(
      `INSERT INTO produtos (nome, cultura, limiar_climatico, valor_indenizacao_wei)
      VALUES ($1, $2, 30, $3)`,
      ["Estiagem — soja", "soja", ethers.parseEther("0.006").toString()],
    );
  });

  return true;
}
