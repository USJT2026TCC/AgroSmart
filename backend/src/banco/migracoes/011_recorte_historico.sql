-- Recorte exclusivo da demonstracao; nenhuma medicao atual entra nesta serie.
ALTER TABLE inmet_dias ADD CONSTRAINT inmet_recorte_historico
  CHECK (estacao = 'A770' AND data BETWEEN DATE '2020-01-01' AND DATE '2026-09-30');
ALTER TABLE inmet_arquivos ADD CONSTRAINT inmet_anos_historicos
  CHECK (estacao = 'A770' AND ano BETWEEN 2020 AND 2026);
