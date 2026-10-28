import { ESCOPO, municipioNoEscopo } from "../../../configuracao/escopo.js";
import { Router } from "express";
import { termosHistoricos } from "../dominio/reproducao.js";

import { conflito, naoEncontrado, pedidoInvalido } from "../erros.js";
import { apoliceDoRecibo } from "../cadeia/leitor.js";
import { registrarApoliceEmitida } from "../dominio/apolices.js";
import { carteiraReservada } from "../dominio/carteirasReservadas.js";
import { descreverTermos, montarStructDeTermos, resumirTermos } from "../dominio/termos.js";
import { exigirPerfil, exigirSessao } from "../seguranca/sessoes.js";
import { hashDeTransacao, uuid } from "../validacao.js";

/**
 * O produtor envia a proposta com cobertura e gatilho históricos. A seguradora
 * prepara os termos e assina a emissão na MetaMask. A API confere o recibo da
 * fábrica e os campos do contrato antes de registrar a apólice.
 */

function propostaPublica(p) {
  return {
    id: p.id,
    situacao: p.situacao,
    produtor: {
      id: p.produtor_id,
      nome: p.produtor_nome,
      identificador: p.produtor_identificador,
    },
    talhao: {
      id: p.talhao_id,
      identificador: p.talhao_identificador,
      cultura: p.talhao_cultura,
      areaHa: p.talhao_area_ha,
    },
    produto: { id: p.produto_id, nome: p.produto_nome },
    carteiraProdutor: p.carteira_produtor,
    valorIndenizacaoWei: p.valor_indenizacao_wei,
    termos: p.termos,
    descricaoDosTermos: p.descricao_dos_termos,
    hashTermos: p.hash_termos,
    vigenciaInicio: p.vigencia_inicio,
    vigenciaFim: p.vigencia_fim,
    apolice: p.apolice_endereco
      ? {
          endereco: p.apolice_endereco,
          txEmissao: p.tx_emissao,
          situacao: p.apolice_situacao,
        }
      : null,
    criadaEm: p.criada_em,
    atualizadaEm: p.atualizada_em,
  };
}

const SQL_PROPOSTA = `
  SELECT p.*,
         u.nome AS produtor_nome, u.identificador AS produtor_identificador,
         t.identificador AS talhao_identificador, t.cultura AS talhao_cultura,
         t.area_ha AS talhao_area_ha,
         pr.nome AS produto_nome, pp.municipio AS municipio_propriedade,
         a.endereco AS apolice_endereco, a.tx_emissao, a.situacao AS apolice_situacao
    FROM propostas p
    JOIN usuarios u  ON u.id = p.produtor_id
    JOIN talhoes t   ON t.id = p.talhao_id
    JOIN produtos pr ON pr.id = p.produto_id
    JOIN propriedades pp ON pp.id = t.propriedade_id
    LEFT JOIN apolices a ON a.proposta_id = p.id
`;

/** Carrega talhao e produto conferindo que pertencem ao produtor e combinam entre si. */
async function carregarBase(banco, { talhaoId, produtoId, produtorId }) {
  const { rows: talhoes } = await banco.query(
    `SELECT t.id, t.identificador, t.cultura, p.produtor_id, p.municipio
       FROM talhoes t JOIN propriedades p ON p.id = t.propriedade_id
      WHERE t.id = $1`,
    [talhaoId],
  );

  const talhao = talhoes[0];

  // Talhao de outro produtor responde como inexistente, e nao como proibido:
  // "proibido" confirmaria que o identificador existe.
  if (!talhao || talhao.produtor_id !== produtorId) throw naoEncontrado("Talhao");

  if (talhao.cultura !== ESCOPO.cultura || !municipioNoEscopo(talhao.municipio)) {
    throw pedidoInvalido(
      "Talhão fora do escopo: a demonstração utiliza soja em São Simão/SP (INMET A770).",
    );
  }

  const { rows: produtos } = await banco.query("SELECT * FROM produtos WHERE id = $1 AND ativo", [
    produtoId,
  ]);

  const produto = produtos[0];
  if (!produto) throw naoEncontrado("Produto");

  if (produto.cultura !== talhao.cultura) {
    throw pedidoInvalido(
      `O produto cobre ${produto.cultura}, mas o talhao esta plantado com ${talhao.cultura}.`,
    );
  }

  return { talhao, produto };
}

export function rotasDePropostas() {
  const r = Router();

  /**
   * Simulacao de cotacao (RF06). Nao grava nada.
   */
  r.post("/cotacoes", exigirSessao, exigirPerfil("produtor"), async (req, res) => {
    const { banco } = req.app.locals;
    const { produto } = await carregarBase(banco, {
      talhaoId: uuid(req.body?.talhaoId, "talhaoId"),
      produtoId: uuid(req.body?.produtoId, "produtoId"),
      produtorId: req.usuario.id,
    });

    const valorIndenizacaoWei = produto.valor_indenizacao_wei;

    const termos = await termosHistoricos(banco, req.body, { valorIndenizacaoWei });
    res.json({
      cotacao: {
        valorIndenizacaoWei: valorIndenizacaoWei.toString(),
        termos,
      },
    });
  });

  /**
   * Proposta (UC05, primeira metade). Exige carteira vinculada: e para ela que a
   * indenizacao seria transferida, e ela precisa ter sido comprovada por
   * assinatura antes (RF02).
   */
  r.post("/propostas", exigirSessao, exigirPerfil("produtor"), async (req, res) => {
    const { banco } = req.app.locals;

    if (!req.usuario.carteira) {
      throw pedidoInvalido(
        "Vincule a carteira antes de enviar a proposta: e para ela que a indenizacao seria transferida.",
      );
    }

    const papel = carteiraReservada(req.usuario.carteira);
    if (papel) {
      throw conflito(
        `A carteira vinculada e a ${papel}. Vincule outra conta da MetaMask antes de enviar a proposta.`,
      );
    }

    const talhaoId = uuid(req.body?.talhaoId, "talhaoId");
    const produtoId = uuid(req.body?.produtoId, "produtoId");
    const { produto } = await carregarBase(banco, {
      talhaoId,
      produtoId,
      produtorId: req.usuario.id,
    });

    const valorIndenizacaoWei = produto.valor_indenizacao_wei;
    const termosPropostos = await termosHistoricos(banco, req.body, { valorIndenizacaoWei });

    // Uma proposta por talhao em analise: a seguradora decide antes de chegar outra.
    // Vem depois da validacao dos termos, para que dados invalidos respondam 400.
    const { rows: emAnalise } = await banco.query(
      "SELECT 1 FROM propostas WHERE talhao_id = $1 AND situacao IN ('pendente', 'preparada')",
      [talhaoId],
    );
    if (emAnalise.length > 0) {
      throw conflito(
        "Este talhao ja tem uma proposta em analise. Aguarde a decisao da seguradora.",
      );
    }

    const { rows } = await banco.query(
      `INSERT INTO propostas (produtor_id, talhao_id, produto_id, carteira_produtor,
                              valor_indenizacao_wei, termos)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        req.usuario.id,
        talhaoId,
        produtoId,
        req.usuario.carteira,
        valorIndenizacaoWei.toString(),
        JSON.stringify(termosPropostos),
      ],
    );

    const { rows: completas } = await banco.query(`${SQL_PROPOSTA} WHERE p.id = $1`, [rows[0].id]);
    res.status(201).json({ proposta: propostaPublica(completas[0]) });
  });

  r.get("/propostas", exigirSessao, async (req, res) => {
    const { banco } = req.app.locals;

    const { rows } =
      req.usuario.perfil === "produtor"
        ? await banco.query(`${SQL_PROPOSTA} WHERE p.produtor_id = $1 ORDER BY p.criada_em DESC`, [
            req.usuario.id,
          ])
        : req.usuario.perfil === "seguradora"
          ? await banco.query(`${SQL_PROPOSTA} ORDER BY p.criada_em DESC`)
          : { rows: [] };

    res.json({ propostas: rows.map(propostaPublica) });
  });

  /**
   * Preparacao da emissao (RF08).
   *
   * Pode ser chamada de novo enquanto a proposta nao foi emitida — a seguradora
   * pode ter desistido de assinar e voltado no dia seguinte. As datas historicas e o gatilho sao preservados; o preparo gera o compromisso dos termos.
   */
  r.post("/propostas/:id/preparar", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { banco, cadeia } = req.app.locals;
    const id = uuid(req.params.id, "id");

    const { rows } = await banco.query(`${SQL_PROPOSTA} WHERE p.id = $1`, [id]);
    const p = rows[0];

    if (!p) throw naoEncontrado("Proposta");
    if (p.talhao_cultura !== ESCOPO.cultura || !municipioNoEscopo(p.municipio_propriedade))
      throw conflito("Proposta fora do escopo: somente soja em São Simão/SP (INMET A770).");
    if (p.situacao === "emitida") throw conflito("Esta proposta ja foi emitida.");
    if (p.situacao === "recusada") throw conflito("Esta proposta foi recusada.");

    const papel = carteiraReservada(p.carteira_produtor);
    if (papel) {
      throw conflito(
        `A carteira beneficiaria desta proposta e a ${papel}; o contrato recusaria a emissao. Recuse a proposta e peca ao produtor que vincule outra conta.`,
      );
    }

    if (!cadeia.disponivel()) {
      throw conflito("Nenhum contrato implantado na rede configurada. Implante antes de emitir.");
    }

    const inicio = Math.floor(Date.parse(`${p.termos.inicioHistorico}T00:00:00Z`) / 1000);
    const fim = Math.floor(Date.parse(`${p.termos.fimHistorico}T23:59:59Z`) / 1000);

    const dados = {
      ...p.termos,
      propostaId: p.id,
      carteiraProdutor: p.carteira_produtor,
      talhao: p.talhao_identificador,
      cultura: p.talhao_cultura,
      limiarClimatico: p.termos.limiarClimatico,
      valorIndenizacaoWei: p.valor_indenizacao_wei,
      vigenciaInicio: inicio,
      vigenciaFim: fim,
    };

    const descricao = descreverTermos(dados);
    const hashTermos = resumirTermos(descricao);

    await banco.query(
      `UPDATE propostas
          SET situacao = 'preparada', descricao_dos_termos = $2, hash_termos = $3,
              vigencia_inicio = to_timestamp($4), vigencia_fim = to_timestamp($5), atualizada_em = now()
        WHERE id = $1`,
      [id, descricao, hashTermos, inicio, fim],
    );

    res.json({
      termos: montarStructDeTermos(dados, hashTermos),
      descricaoDosTermos: descricao,
      hashTermos,
      fabrica: cadeia.enderecoDaFabrica(),
      modoHistorico: !!p.termos.modoHistorico,
    });
  });

  /**
   * Confirmacao da emissao (RF07, RF08). O backend confere tudo na cadeia.
   */
  r.post("/propostas/:id/emissao", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { banco, cadeia } = req.app.locals;
    const id = uuid(req.params.id, "id");
    const txHash = hashDeTransacao(req.body?.txHash);

    const { rows } = await banco.query("SELECT * FROM propostas WHERE id = $1", [id]);
    const proposta = rows[0];

    if (!proposta) throw naoEncontrado("Proposta");
    if (!proposta.hash_termos) throw conflito("Prepare a emissao antes de confirmar.");

    const recibo = await cadeia.recibo(txHash);

    // Transacao ainda nao minerada: o aplicativo pode tentar de novo em alguns
    // segundos. E o indexador vai encontrar a emissao de qualquer forma.
    if (!recibo)
      throw conflito("Transacao ainda nao confirmada na rede. Tente de novo em instantes.");
    if (recibo.status !== 1) throw pedidoInvalido("A transacao foi revertida na rede.");

    const fabrica = cadeia.enderecoDaFabrica();

    if (recibo.para !== fabrica) {
      throw pedidoInvalido("A transacao nao foi enviada a fabrica de apolices oficial.");
    }

    const emitida = apoliceDoRecibo(recibo, fabrica);
    if (!emitida) throw pedidoInvalido("A transacao nao emitiu nenhuma apolice.");

    // O resumo gravado no contrato precisa ser o que o backend gerou. Se nao for,
    // a seguradora assinou termos diferentes dos acordados — e o cadastro nao
    // pode ligar esta apolice a esta proposta.
    if (emitida.hashTermos !== proposta.hash_termos) {
      throw pedidoInvalido(
        "O resumo dos termos gravado no contrato nao corresponde ao desta proposta.",
        {
          esperado: proposta.hash_termos,
          naCadeia: emitida.hashTermos,
        },
      );
    }

    const termos = await cadeia.termosDaApolice(emitida.endereco);

    if (!!termos.modoHistorico !== !!proposta.termos.modoHistorico)
      throw pedidoInvalido("Modo do contrato difere da proposta.");
    if (termos.produtor !== proposta.carteira_produtor) {
      throw pedidoInvalido("A carteira beneficiaria no contrato nao e a do produtor da proposta.");
    }

    if (termos.valorIndenizacao !== String(proposta.valor_indenizacao_wei)) {
      throw pedidoInvalido("O limite gravado no contrato difere do limite cotado.");
    }

    const registro = await registrarApoliceEmitida(banco, {
      endereco: emitida.endereco,
      produtor: termos.produtor,
      seguradora: termos.seguradora,
      hashTermos: emitida.hashTermos,
      talhaoBytes32: termos.talhao,
      valorIndenizacaoWei: termos.valorIndenizacao,
      txHash,
      bloco: recibo.bloco,
      termosNaCadeia: termos,
    });

    res.json({
      apolice: {
        endereco: emitida.endereco,
        txEmissao: txHash,
        bloco: recibo.bloco,
      },
      ...registro,
    });
  });

  r.post("/propostas/:id/recusar", exigirSessao, exigirPerfil("seguradora"), async (req, res) => {
    const { banco } = req.app.locals;
    const id = uuid(req.params.id, "id");

    const { rowCount } = await banco.query(
      `UPDATE propostas SET situacao = 'recusada', atualizada_em = now()
        WHERE id = $1 AND situacao IN ('pendente', 'preparada')`,
      [id],
    );

    if (rowCount === 0) throw conflito("A proposta nao existe ou ja foi emitida.");
    res.status(204).end();
  });

  return r;
}
