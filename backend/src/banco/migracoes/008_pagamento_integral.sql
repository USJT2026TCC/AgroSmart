-- Preserva catalogos e propostas historicos. Apenas ofertas novas/ativas sao integrais.
UPDATE produtos SET ativo = false WHERE modo_pagamento <> 0 OR limiar_climatico_integral <> 0;
ALTER TABLE produtos ADD CONSTRAINT produto_pagamento_integral
  CHECK (NOT ativo OR (modo_pagamento = 0 AND limiar_climatico_integral = 0));
