import { ethers } from "ethers";

import { config } from "../config.js";
import { gerarHashDeSenha } from "../seguranca/cripto.js";

/**
 * Dados de demonstracao.
 *
 * Os mesmos usuarios, talhoes e produtos que o aplicativo tinha embutidos no
 * navegador antes do backend — agora no banco, com senha em hash e poligono no
 * PostGIS. So roda em desenvolvimento e com o banco vazio: em producao, recusa;
 * com usuarios ja cadastrados, nao toca em nada.
 *
 */

export async function semear(banco) {
  if (config.emProducao) throw new Error("A semente de demonstracao nao roda em producao.");

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
      "Joao Ribeiro",
      "produtor",
      "Fazenda Santa Clara — Ribeirao Preto/SP",
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
      [produtor, "Fazenda Santa Clara", "Sao Simao/SP"],
    );

    // Talhoes ficticios: a demonstracao assume coincidencia com a estacao A770.
    const talhoes = [
      {
        identificador: "talhao-01",
        cultura: "soja",
        anel: [
          [-47.59, -21.45],
          [-47.57, -21.45],
          [-47.57, -21.47],
          [-47.59, -21.47],
          [-47.59, -21.45],
        ],
      },
      {
        identificador: "talhao-02",
        cultura: "milho",
        anel: [
          [-47.56, -21.44],
          [-47.54, -21.44],
          [-47.54, -21.46],
          [-47.56, -21.46],
          [-47.56, -21.44],
        ],
      },
    ];

    for (const t of talhoes) {
      const geojson = JSON.stringify({
        type: "Polygon",
        coordinates: [t.anel],
      });

      const { rows: novo } = await tx.query(
        `WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($4), 4326) AS geom)
         INSERT INTO talhoes (propriedade_id, identificador, cultura, geometria, area_ha)
         SELECT $1, $2, $3, g.geom, round((ST_Area(g.geom::geography) / 10000)::numeric, 4) FROM g
         RETURNING id`,
        [prop[0].id, t.identificador, t.cultura, geojson],
      );
    }

    const produtos = [["Estiagem — soja", "soja", 0, 30, 0, "0.006", 450, 180]];

    for (const [nome, cultura, modo, lc, lci, porHa, taxa, dias] of produtos) {
      await tx.query(
        `INSERT INTO produtos (nome, cultura, modo_pagamento, limiar_climatico,
                               limiar_climatico_integral, valor_por_hectare_wei, taxa_premio_bps,
                               vigencia_dias)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [nome, cultura, modo, lc, lci, ethers.parseEther(porHa).toString(), taxa, dias],
      );
    }

    // E-mails de demonstracao no dominio reservado .test (RFC 2606): nao
    // existem, e as mensagens vao para a caixa de saida local (RF27).
    await tx.query(
      "UPDATE usuarios SET email = identificador || '@agrosmart.test' WHERE email IS NULL",
    );
  });

  return true;
}
