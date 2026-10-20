# Backend e banco

A API atende em `http://localhost:3001/api`, iniciada por `npm start` na raiz.
O banco persistente usa PostgreSQL com PostGIS; sem servidor externo configurado,
o iniciador usa PGlite, separado pelo endereco da fabrica Sepolia.

## Serie historica

Execute `npm run dados:preparar` uma vez. Na inicializacao, `importarInmet.js`
confere o manifesto e importa somente anos novos ou alterados, em transacoes.
Reiniciar o sistema nao baixa arquivos nem recalcula os diarios.

| Tabela | Conteudo |
|---|---|
| `inmet_arquivos` | Estacao, ano, SHA-256 e procedencia do arquivo |
| `inmet_dias` | Data, chuva diaria, horas validas, ausentes e invalidas |
| `propostas` | Cobertura hipotetica, gatilho experimental e hash da serie |
| `apolices`, `eventos_cadeia` | Espelho dos contratos e eventos publicos |
| `publicacoes_oraculo` | Relatos, procedencia, custo e confirmacao pelo indexador |

`POST /historico/avaliar` consulta sem movimentar valores. Exige login.
`GET /historico/disponibilidade` mostra os anos importados e sua qualidade.
`GET /oraculo/serie-historica` entrega a serie da proposta ao servico autenticado.
Os caminhos acima sao relativos a `/api`.

Proposta historica exige carteira vinculada, datas validas entre 2020 e 30/09/2026,
gatilho inteiro de 1 a 366 dias e todos os dias com pelo menos 20 horas validas.
Os termos canonicos incluem o modo, a estacao, o hash da serie e a contagem desde
o inicio. Confirmacao da emissao confere recibo, fabrica, hash, modo e beneficiario.
O backend nao possui chave do produtor nem assina emissao ou pagamento.

## Seguranca e compatibilidade

Login, perfis, assinatura de vinculo de carteira e protecao das rotas permanecem.
As rotas do oraculo exigem chave de servico, diferente da chave privada da blockchain.
O indexador confirma eventos em cadeia; um relato do oraculo sozinho nao e confirmacao.
O banco nao transfere ETH e o resultado de uma consulta nao significa pagamento.

O percurso legado `POST /leituras` recebe lotes HTTP assinados sobre os bytes exatos
do corpo: mensagem EIP-191 `AgroSmart:leituras:v1` seguida de `sha256:<hash>`.
Ele nao e necessario ao modo historico importado. A importacao nao fabrica
assinaturas de sensores nem afirma que o INMET assinou digitalmente os arquivos.

Migracoes antigas sao preservadas para atualizar bancos existentes. Dados locais,
originais baixados e segredos ficam fora do Git. Todos os testes estao em `testes/`.
