-- Registro local da transicao PGlite -> PostgreSQL. Nao contem dados distribuidos.
CREATE TABLE transferencias_banco (
  origem text PRIMARY KEY,
  transferida_em timestamptz NOT NULL DEFAULT now(),
  tabelas jsonb NOT NULL
);
