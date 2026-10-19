-- Remocao completa do modulo de visao computacional (RF14 a RF17, contestacao
-- RF28) e do papel de perito. O sistema passa a ser 100% indexado por clima; o
-- contrato ja foi simplificado (Termos e Publicacao sem campos de dano,
-- publicarIndices com periodo e indiceClimatico apenas, sem retificacao).

-- ------------------------------------------------------- imagens e contestacao

-- Ordem de remocao: primeiro quem referencia lotes_de_imagens (contestacoes,
-- analises_de_imagem, imagens), depois a propria lotes_de_imagens.
DROP TABLE IF EXISTS contestacoes;
DROP TABLE IF EXISTS analises_de_imagem;
DROP TABLE IF EXISTS imagens;
DROP TABLE IF EXISTS lotes_de_imagens;

-- ------------------------------------------------------------------- perito

-- O papel de perito so existia para revisar laudo de imagem e contestacao, que
-- nao existem mais.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('produtor', 'seguradora'));

-- ----------------------------------------------------------------- produtos

-- As constraints de dano saem; as climaticas ficam, mas sem o "ou operador = 1"
-- que as dispensava para um produto so-dano — produto so-dano nao existe mais.
ALTER TABLE produtos DROP CONSTRAINT produto_limiar_dano;
ALTER TABLE produtos DROP CONSTRAINT produto_teto_dano;
ALTER TABLE produtos DROP CONSTRAINT produto_limiar_climatico;
ALTER TABLE produtos DROP CONSTRAINT produto_teto_climatico;

ALTER TABLE produtos DROP COLUMN operador;
ALTER TABLE produtos DROP COLUMN limiar_dano_bps;
ALTER TABLE produtos DROP COLUMN limiar_dano_integral_bps;

ALTER TABLE produtos ADD CONSTRAINT produto_limiar_climatico CHECK (limiar_climatico > 0);
ALTER TABLE produtos ADD CONSTRAINT produto_teto_climatico
  CHECK (modo_pagamento = 0 OR limiar_climatico_integral > limiar_climatico);

-- -------------------------------------------------- publicacoes do oraculo

ALTER TABLE publicacoes_oraculo DROP COLUMN indice_dano_bps;
ALTER TABLE publicacoes_oraculo DROP COLUMN confianca_bps;
