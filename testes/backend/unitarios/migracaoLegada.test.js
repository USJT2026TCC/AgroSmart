import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import request from "supertest";
import { abrirBancoDeTeste } from "../fixtures/banco.js";
import { migrar } from "../../../backend/src/banco/migrar.js";
import {
  gerarHashDeSenha,
  sha256Hex,
} from "../../../backend/src/seguranca/cripto.js";
import { criarApp } from "../../../backend/src/app.js";

test("banco da versao inicial migra preservando e bloqueando conta de papel retirado", async () => {
  const banco = await abrirBancoDeTeste();
  try {
    await banco.executar(
      readFileSync(
        new URL(
          "../../../backend/src/banco/migracoes/001_inicial.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await banco.executar(
      "CREATE TABLE migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now()); INSERT INTO migracoes(nome) VALUES ('001_inicial.sql');",
    );
    const { rows } = await banco.query(
      "INSERT INTO usuarios (identificador,nome,perfil,hash_senha) VALUES ('historico','Conta preservada','perito',$1) RETURNING id",
      [await gerarHashDeSenha("senha-de-teste")],
    );
    const id = rows[0].id;
    await banco.query(
      "INSERT INTO sessoes(usuario_id,hash_token,expira_em) VALUES ($1,$2,now()+interval '1 hour')",
      [id, sha256Hex("token-legado")],
    );
    const aplicadas = await migrar(banco);
    assert.ok(aplicadas.includes("006_z_arquivar_perfil.sql"));
    const registro = (
      await banco.query(
        "SELECT id,perfil_legado,acesso_bloqueado FROM usuarios WHERE id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(registro.id, id);
    assert.equal(registro.perfil_legado, "perito");
    assert.equal(registro.acesso_bloqueado, true);
    const api = request(
      criarApp({ banco, cadeia: { disponivel: () => false } }),
    );
    const login = await api
      .post("/api/autenticacao/entrar")
      .send({ identificador: "historico", senha: "senha-de-teste" });
    assert.equal(login.status, 401);
    const sessao = await api
      .get("/api/autenticacao/eu")
      .set("Authorization", "Bearer token-legado");
    assert.equal(sessao.status, 401);
    const tabelas = (
      await banco.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      )
    ).rows.map((r) => r.tablename);
    assert.ok(!tabelas.includes("imagens"));
    assert.ok(!tabelas.includes("contestacoes"));
    assert.deepEqual(await migrar(banco), []);
  } finally {
    await banco.fechar();
  }
});
