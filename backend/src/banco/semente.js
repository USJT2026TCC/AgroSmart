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
 * As fontes guardam somente enderecos publicos. A assinatura e feita fora da API.
 */

/**
 * Fontes do talhao-01.
 *
 * As duas primeiras sao estacoes REAIS do INMET, nas coordenadas publicadas
 * pelo proprio instituto: A770, em Sao Simao/SP, ao lado do talhao, e A747, em
 * Pradopolis/SP, a 57 km. O simulador (`simulador/`) envia a serie historica
 * delas — inclusive as horas em que o pluviometro nao mediu nada.
 *
 * Fonte: INMET — https://portal.inmet.gov.br/dadoshistoricos
 *
 * Sao duas, e nao uma, porque o consolidador exige no minimo duas fontes para
 * publicar um indice: uma estacao sozinha decidindo um pagamento e exatamente o
 * ponto unico de confianca que o projeto tenta evitar.
 *
 * A terceira e um sensor de solo no talhao, que ainda nao tem equivalente real
 * e por isso fica sem serie ate o hardware existir.
 */
export const FONTES_DE_DEMONSTRACAO = [
  {
    id: "estacao-inmet-a770",
    tipo: "estacao",
    carteira: "0xbcd4042de499d14e55001ccbb24a551f3b954096",
    lon: -47.57944444,
    lat: -21.46111111,
  },
  {
    id: "estacao-inmet-a747",
    tipo: "estacao",
    carteira: "0x71be63f3384f5fb98995898a86b02fb2426c5788",
    lon: -48.11388888,
    lat: -21.33833333,
  },
  {
    id: "sensor-solo-talhao-01",
    tipo: "sensor_solo",
    carteira: "0xfabb0ac9d68b0b445fb7357272ff202c5651694a",
    lon: -47.585,
    lat: -21.455,
  },
];

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

    // Os talhoes ficam a poucos quilometros da estacao A770, em area de cana e
    // graos de Sao Simao. A distancia importa: leitura de chuva vale para a
    // vizinhanca da estacao, e uma apolice indexada por estacao distante mede
    // outra lavoura que nao a segurada.
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

    const ids = {};

    for (const t of talhoes) {
      const geojson = JSON.stringify({ type: "Polygon", coordinates: [t.anel] });

      const { rows: novo } = await tx.query(
        `WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($4), 4326) AS geom)
         INSERT INTO talhoes (propriedade_id, identificador, cultura, geometria, area_ha)
         SELECT $1, $2, $3, g.geom, round((ST_Area(g.geom::geography) / 10000)::numeric, 4) FROM g
         RETURNING id`,
        [prop[0].id, t.identificador, t.cultura, geojson],
      );

      ids[t.identificador] = novo[0].id;
    }

    for (const f of FONTES_DE_DEMONSTRACAO) {
      await tx.query(
        `INSERT INTO fontes (id, talhao_id, tipo, endereco, localizacao)
         VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326))`,
        [f.id, ids["talhao-01"], f.tipo, f.carteira, f.lon, f.lat],
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
