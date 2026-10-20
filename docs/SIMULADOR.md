# Preparacao e reproducao historica

As instrucoes operacionais estao em [simulador/README.md](../simulador/README.md).
Use `npm run dados:preparar` uma vez e depois `npm start` na raiz.

O Python baixa, interpreta e prepara a serie A770 de 2020 a setembro de 2026.
A API importa os dias no banco persistente, com controle por ano e SHA-256.
O oraculo percorre os dias da cobertura, a partir de zero, e publica apenas o
primeiro periodo acionador; sem acionamento, publica o ultimo periodo com seu indice.
Nao ha uma transacao por dia. A consulta detalhada de dias e feita no banco.

O modo historico usa uma apolice explicitamente identificada na cadeia.
A data meteorologica e diferente da data real do bloco. O pagamento ocorre agora
na Sepolia, com ETH de teste. Nao representa contratacao retroativa real.
