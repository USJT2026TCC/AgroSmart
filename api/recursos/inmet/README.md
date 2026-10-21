# Serie publica distribuida com o projeto

Somente Sao Simao/SP, estacao INMET A770, 01/01/2020 a 30/09/2026.
Os sete CSVs originais, os diarios preparados e o manifesto SHA-256 acompanham
o codigo para permitir carga inicial sem baixar os ZIPs nacionais novamente.
Total: 2.465 dias, incluindo dias identificados como incompletos.

Fonte: https://portal.inmet.gov.br/dadoshistoricos
Arquivos obtidos do portal em 19–20/10/2026. URLs e nomes originais estao no manifesto.
Os CSVs originais sao copiados byte a byte, sem alterar codificacao ou quebras de linha.
Os diarios usam as datas originais e a regra documentada em etl/README.md.
No ZIP de 2026 foi selecionado o snapshot com termino em 30/09/2026.

Nao e dump do banco: nao inclui usuarios, carteiras, senhas, sessoes ou segredos.
O hash permite conferir integridade local; nao constitui assinatura digital do INMET.
O backend importa cada versao uma vez e preserva os dados no volume PostgreSQL.
Para reconstruir a partir da fonte, use `npm run dados:preparar` e depois
`npm run dados:empacotar`. Esta acao nao e necessaria para executar a aplicacao.
