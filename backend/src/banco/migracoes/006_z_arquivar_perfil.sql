-- Executa antes de 007: a constraint antiga ainda permite perito nesta etapa.
-- Preserva identidade e referencias historicas, sem manter acesso ou novo papel ativo.
ALTER TABLE usuarios ADD COLUMN acesso_bloqueado boolean NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN perfil_legado text;
UPDATE usuarios SET perfil_legado = perfil, acesso_bloqueado = true, perfil = 'produtor'
  WHERE perfil = 'perito';
UPDATE sessoes SET revogada_em = now()
  WHERE usuario_id IN (SELECT id FROM usuarios WHERE acesso_bloqueado);
-- O valor tecnico produtor serve apenas para satisfazer o esquema de dois perfis.
-- A conta arquivada nao autentica, nao participa de cadastros nem recebe novo acesso.
