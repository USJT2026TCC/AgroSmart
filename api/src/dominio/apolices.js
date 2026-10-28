import { ethers } from "ethers";
import { conferirEmissao } from "./conferirEmissao.js";

/**
 * Registro de uma apolice emitida na cadeia.
 *
 * Ha dois caminhos que chegam aqui, e os dois convergem nesta funcao:
 *
 *  1. o aplicativo avisa a API logo depois que a seguradora assina a emissao;
 *  2. o indexador encontra o evento `ApoliceEmitida` ao varrer os blocos.
 *
 * O segundo existe porque o primeiro pode nao acontecer. A seguradora assina, a
 * transacao entra na rede, e o navegador fecha antes do aviso. Sem o indexador, a
 * apolice existiria na cadeia e nao existiria no cadastro. Com ele, a proposta e
 * ligada a apolice de qualquer forma, alguns segundos depois.
 *
 * A funcao e idempotente: chamada duas vezes para a mesma apolice, o resultado e
 * o mesmo — o que e justamente o que acontece quando os dois caminhos funcionam.
 *
 * A ligacao com a proposta e feita pelo `hashTermos`. Ele e unico por proposta,
 * porque a descricao dos termos inclui o identificador dela; e o valor que vale e
 * o do evento emitido pela fabrica oficial, e nao o que um cliente alegou.
 */
export async function registrarApoliceEmitida(banco, dados) {
  const {
    endereco,
    produtor,
    seguradora,
    hashTermos,
    talhaoBytes32,
    valorIndenizacaoWei,
    txHash,
    bloco,
    termosNaCadeia,
  } = dados;

  return banco.transacao(async (tx) => {
    const { rows: propostas } = await tx.query(
      `SELECT p.*, t.identificador AS talhao_identificador, t.cultura AS talhao_cultura
         FROM propostas p JOIN talhoes t ON t.id = p.talhao_id
        WHERE p.hash_termos = $1 FOR UPDATE OF p`,
      [hashTermos],
    );

    const proposta = propostas[0] ?? null;
    if (proposta) {
      conferirEmissao(proposta, termosNaCadeia);
      // Evento e leitura do contrato precisam representar a mesma emissao.
      conferirEmissao(proposta, {
        ...termosNaCadeia,
        produtor,
        hashTermos,
        talhao: talhaoBytes32,
        valorIndenizacao: String(valorIndenizacaoWei),
      });
    }

    // Apolice emitida fora do aplicativo: tenta achar o talhao pelo identificador.
    let talhaoId = proposta?.talhao_id ?? null;

    if (!talhaoId && talhaoBytes32) {
      let identificador = null;

      try {
        identificador = ethers.decodeBytes32String(talhaoBytes32);
      } catch {
        identificador = null;
      }

      if (identificador) {
        const { rows } = await tx.query("SELECT id FROM talhoes WHERE identificador = $1", [
          identificador,
        ]);
        talhaoId = rows[0]?.id ?? null;
      }
    }

    const { rows } = await tx.query(
      `INSERT INTO apolices (endereco, proposta_id, talhao_id, produtor_carteira, seguradora_carteira,
                             talhao_bytes32, hash_termos, valor_indenizacao_wei, tx_emissao, bloco_emissao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (endereco) DO UPDATE
         SET proposta_id = COALESCE(apolices.proposta_id, EXCLUDED.proposta_id),
             talhao_id   = COALESCE(apolices.talhao_id, EXCLUDED.talhao_id)
       RETURNING id, (xmax = 0) AS nova`,
      [
        endereco.toLowerCase(),
        proposta?.id ?? null,
        talhaoId,
        produtor.toLowerCase(),
        (seguradora ?? "").toLowerCase(),
        talhaoBytes32 ?? "",
        hashTermos,
        String(valorIndenizacaoWei),
        txHash,
        bloco,
      ],
    );

    if (proposta) {
      await tx.query(
        `UPDATE propostas SET situacao = 'emitida', atualizada_em = now()
          WHERE id = $1 AND situacao <> 'emitida'`,
        [proposta.id],
      );
    }

    return { apoliceId: rows[0].id, nova: rows[0].nova, propostaId: proposta?.id ?? null };
  });
}
