-- Serie historica independente da ingestao de sensores: nao simula assinatura INMET.
CREATE TABLE inmet_arquivos (
  estacao text NOT NULL, ano smallint NOT NULL,
  sha256_original text NOT NULL, sha256_diario text NOT NULL,
  procedencia jsonb NOT NULL, importado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estacao, ano)
);
CREATE TABLE inmet_dias (
  estacao text NOT NULL, data date NOT NULL,
  chuva_mm numeric(9,1) CHECK (chuva_mm >= 0),
  horas_validas smallint NOT NULL CHECK (horas_validas BETWEEN 0 AND 24),
  horas_ausentes smallint NOT NULL CHECK (horas_ausentes BETWEEN 0 AND 24),
  horas_invalidas smallint NOT NULL CHECK (horas_invalidas BETWEEN 0 AND 24),
  CHECK (horas_validas + horas_ausentes + horas_invalidas = 24),
  CHECK (horas_validas = 0 OR chuva_mm IS NOT NULL),
  PRIMARY KEY (estacao, data)
);
