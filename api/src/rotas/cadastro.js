import { ESCOPO, municipioNoEscopo } from "../../../configuracao/escopo.js";
import { Router } from "express";
import { ethers } from "ethers";

import { conflito, naoEncontrado, pedidoInvalido } from "../erros.js";
import { exigirPerfil, exigirSessao } from "../seguranca/sessoes.js";
import { decimalPositivo, texto, uuid } from "../validacao.js";

/** Cadastros do produtor fixo e configuração do seguro da demonstração. */

const SQL_TALHAO = `
  SELECT t.id, t.identificador, t.cultura, t.area_ha, t.criado_em,
         p.id AS propriedade_id, p.nome AS propriedade, p.municipio,
         u.id AS produtor_id, u.nome AS produtor_nome, u.identificador AS produtor_identificador
    FROM talhoes t
    JOIN propriedades p ON p.id = t.propriedade_id
    JOIN usuarios u ON u.id = p.produtor_id
`;

function talhaoPublico(linha) {
  return {
    id: linha.id,
    identificador: linha.identificador,
    cultura: linha.cultura,
    areaHa: linha.area_ha,
    propriedade: { id: linha.propriedade_id, nome: linha.propriedade, municipio: linha.municipio },
    produtor: {
      id: linha.produtor_id,
      nome: linha.produtor_nome,
      identificador: linha.produtor_identificador,
    },
  };
}

function exigirCultura(cultura) {
  if (cultura !== ESCOPO.cultura) throw pedidoInvalido("A demonstração permite somente soja.");
  return ESCOPO.cultura;
}

function exigirMunicipio(municipio) {
  if (!municipioNoEscopo(municipio))
    throw pedidoInvalido("A demonstração utiliza somente São Simão/SP (INMET A770).");
  return ESCOPO.municipio;
}

function produtoPublico(p) {
  return {
    id: p.id,
    nome: p.nome,
    cultura: p.cultura,
    limiarClimatico: p.limiar_climatico,
    valorIndenizacaoWei: p.valor_indenizacao_wei,
    valorIndenizacaoEth: ethers.formatEther(p.valor_indenizacao_wei),
    ativo: p.ativo,
  };
}

export function rotasDeCadastro() {
  const r = Router();

  // ---------------------------------------------------------- produtores

  r.get("/produtores", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { rows } = await req.app.locals.banco.query(
      `SELECT id, identificador, nome, documento, carteira FROM usuarios
        WHERE perfil = 'produtor' AND identificador = $1 ORDER BY nome`,
      [ESCOPO.produtor],
    );

    res.json({ produtores: rows });
  });

  // --------------------------------------------------------- propriedades

  r.get("/propriedades", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { rows } = await req.app.locals.banco.query(
      `SELECT p.id, p.nome, p.municipio, p.produtor_id, u.nome AS produtor_nome,
              (SELECT count(*)::int FROM talhoes t WHERE t.propriedade_id = p.id) AS talhoes
         FROM propriedades p JOIN usuarios u ON u.id = p.produtor_id
        WHERE u.identificador = $1 AND u.perfil = 'produtor'
        ORDER BY u.nome, p.nome`,
      [ESCOPO.produtor],
    );
    res.json({ propriedades: rows });
  });

  // ------------------------------------------------------------- talhoes

  r.get("/talhoes", exigirSessao, async (req, res) => {
    const { banco } = req.app.locals;

    // Os dois acessos consultam os talhões do produtor fixo.
    const { rows } =
      req.usuario.perfil === "produtor"
        ? await banco.query(`${SQL_TALHAO} WHERE u.id = $1 ORDER BY t.identificador`, [
            req.usuario.id,
          ])
        : await banco.query(
            `${SQL_TALHAO} WHERE u.identificador = $1 AND u.perfil = 'produtor' ORDER BY t.identificador`,
            [ESCOPO.produtor],
          );

    res.json({ talhoes: rows.map(talhaoPublico) });
  });

  /**
   * Cadastro de talhao (UC02, HU09). Restrito a seguradora, como no caso de uso.
   */
  r.post("/talhoes", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { banco } = req.app.locals;
    const corpo = req.body ?? {};

    const identificador = texto(corpo.identificador, "identificador", { max: 31 });
    const cultura = exigirCultura(texto(corpo.cultura, "cultura", { max: 40 }).toLowerCase());
    const produtorId = uuid(corpo.produtorId, "produtorId");
    const area = decimalPositivo(corpo.areaHa, "areaHa", { casas: 4 });
    if (area && Number(area) >= 1e10) throw pedidoInvalido("Area fora do limite permitido.");

    // Um bytes32 comporta 31 bytes, e caracteres acentuados ocupam mais de um.
    if (Buffer.byteLength(identificador, "utf8") > 31) {
      throw pedidoInvalido("O identificador ocupa mais de 31 bytes; evite acentos.");
    }

    const { rows: produtores } = await banco.query(
      "SELECT id FROM usuarios WHERE id = $1 AND perfil = 'produtor' AND identificador = $2",
      [produtorId, ESCOPO.produtor],
    );
    if (!produtores[0]) throw naoEncontrado("Produtor");

    const talhaoId = await banco.transacao(async (tx) => {
      // A propriedade e reaproveitada quando ja existe com o mesmo nome para o
      // mesmo produtor; senao, e criada junto.
      let propriedadeId = corpo.propriedadeId ? uuid(corpo.propriedadeId, "propriedadeId") : null;

      if (!propriedadeId) {
        const nome = texto(corpo.propriedade?.nome, "propriedade.nome", { max: 120 });
        const municipio = texto(corpo.propriedade?.municipio, "propriedade.municipio", {
          max: 120,
        });

        exigirMunicipio(municipio);
        const { rows: existentes } = await tx.query(
          "SELECT id FROM propriedades WHERE produtor_id = $1 AND nome = $2",
          [produtorId, nome],
        );

        propriedadeId =
          existentes[0]?.id ??
          (
            await tx.query(
              "INSERT INTO propriedades (produtor_id, nome, municipio) VALUES ($1, $2, $3) RETURNING id",
              [produtorId, nome, municipio],
            )
          ).rows[0].id;
      }

      {
        const { rows: propriedades } = await tx.query(
          "SELECT municipio FROM propriedades WHERE id = $1 AND produtor_id = $2",
          [propriedadeId, produtorId],
        );
        if (!propriedades.length)
          throw pedidoInvalido("A propriedade nao pertence ao produtor informado.");
        exigirMunicipio(propriedades[0].municipio);
      }

      const { rows } = await tx.query(
        `INSERT INTO talhoes (propriedade_id, identificador, cultura, area_ha)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [propriedadeId, identificador, cultura, area],
      );

      return rows[0].id;
    });

    const { rows } = await banco.query(`${SQL_TALHAO} WHERE t.id = $1`, [talhaoId]);
    res.status(201).json({ talhao: talhaoPublico(rows[0]) });
  });

  r.delete("/talhoes/:id", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { banco } = req.app.locals;
    const id = uuid(req.params.id, "id");
    const { rows: donos } = await banco.query(`${SQL_TALHAO} WHERE t.id = $1`, [id]);
    if (donos[0]?.produtor_identificador !== ESCOPO.produtor) throw naoEncontrado("Talhao");

    // Talhao com proposta ou apolice nao sai: a apolice na cadeia continuaria
    // apontando para ele, e o historico perderia a referencia.
    const { rows } = await banco.query(
      `SELECT (SELECT count(*) FROM propostas WHERE talhao_id = $1)::int
            + (SELECT count(*) FROM apolices WHERE talhao_id = $1)::int AS usos`,
      [id],
    );

    if (rows[0].usos > 0)
      throw conflito("Este talhao ja tem proposta ou apolice e nao pode ser removido.");

    await banco.transacao(async (tx) => {
      await tx.query("DELETE FROM talhoes WHERE id = $1", [id]);
    });
    res.status(204).end();
  });

  // ------------------------------------------------------------ produtos

  r.get("/produtos", exigirSessao, async (req, res) => {
    const { rows } = await req.app.locals.banco.query(
      "SELECT * FROM produtos WHERE ativo AND cultura = $1 ORDER BY nome",
      [ESCOPO.cultura],
    );
    res.json({ produtos: rows.map(produtoPublico) });
  });

  return r;
}
