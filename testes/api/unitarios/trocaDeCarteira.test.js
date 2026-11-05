import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { montar, entrar, com, PRODUTOR_NA_CADEIA } from "../fixtures/ajuda.js";
test("desvincular e trocar carteira preserva apolices do produtor e nao revela proposta alheia", async () => {
  const ctx = await montar();
  try {
    const usuario = (
      await ctx.banco.query("SELECT id FROM usuarios WHERE identificador='produtor'")
    ).rows[0];
    const inserir = async (dono, endereco) => {
      const proposta = (
        await ctx.banco.query(
          `INSERT INTO propostas(produtor_id,talhao_id,produto_id,carteira_produtor,valor_indenizacao_wei,termos,situacao)
    SELECT $1,t.id,pr.id,$2,pr.valor_indenizacao_wei,'{}','emitida' FROM talhoes t CROSS JOIN produtos pr LIMIT 1 RETURNING id`,
          [dono, PRODUTOR_NA_CADEIA],
        )
      ).rows[0];
      await ctx.banco.query(
        `INSERT INTO apolices(endereco,proposta_id,produtor_carteira,seguradora_carteira,talhao_bytes32,hash_termos,valor_indenizacao_wei,tx_emissao,bloco_emissao)
    VALUES($1,$2,$3,'0xseg','0x','0x',6000000000000000,$1,1)`,
        [endereco, proposta.id, PRODUTOR_NA_CADEIA],
      );
    };
    const propria = "0x000000000000000000000000000000000000aa01";
    const alheia = "0x000000000000000000000000000000000000aa02";
    await inserir(usuario.id, propria);
    const outro = (
      await ctx.banco.query(
        `INSERT INTO usuarios(identificador,nome,perfil,hash_senha) SELECT 'sem.acesso','Outro','produtor',hash_senha FROM usuarios WHERE id=$1 RETURNING id`,
        [usuario.id],
      )
    ).rows[0];
    await inserir(outro.id, alheia);
    const token = await entrar(ctx.api, "produtor");
    const conferir = async () => {
      const lista = await ctx.api().get("/api/apolices").set(com(token));
      assert.equal(lista.status, 200);
      assert.deepEqual(
        lista.body.apolices.map((a) => a.endereco),
        [propria],
      );
      assert.equal(lista.body.apolices[0].produtor.nome, "João Ribeiro");
      const detalhe = await ctx
        .api()
        .get("/api/apolices/" + propria)
        .set(com(token));
      assert.equal(detalhe.status, 200);
      assert.equal(detalhe.body.apolice.produtor.carteira, PRODUTOR_NA_CADEIA);
      assert.equal(
        (
          await ctx
            .api()
            .get("/api/apolices/" + alheia)
            .set(com(token))
        ).status,
        404,
      );
    };
    await conferir();
    assert.equal((await ctx.api().delete("/api/carteira").set(com(token))).status, 204);
    await conferir();
    const nova = ethers.Wallet.createRandom();
    const desafio = await ctx.api().post("/api/carteira/desafio").set(com(token));
    const vinculo = await ctx
      .api()
      .post("/api/carteira/vincular")
      .set(com(token))
      .send({
        desafioId: desafio.body.desafioId,
        endereco: nova.address,
        assinatura: await nova.signMessage(desafio.body.mensagem),
      });
    assert.equal(vinculo.status, 200, JSON.stringify(vinculo.body));
    await conferir();
  } finally {
    await ctx.fechar();
  }
});
