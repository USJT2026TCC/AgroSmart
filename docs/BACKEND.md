# Backend e banco

A API atende em `http://localhost:3001/api`, iniciada por `npm start` na raiz.
O banco persistente usa PostgreSQL com PostGIS no Docker Compose. A API também
executa no Docker e recebe a conexão interna do iniciador. As suites tambem utilizam
PostgreSQL/PostGIS real, em bancos descartaveis separados dos cadastros de uso.

## Serie historica

A serie publica preparada acompanha o repositorio. Na inicializacao, `importarInmet.js`
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

Rotas de ingestao de sensores e cadastro de fontes foram removidas.
A importacao nao fabrica assinaturas de sensores nem afirma que o INMET assinou
digitalmente os arquivos. A autenticacao da API usa a chave de servico.
Novas cotacoes e propostas exigem reproducao historica explicita; propostas
convencionais antigas permanecem consultaveis, mas seu preparo e bloqueado.

Relatos sao confirmados somente quando apolice, periodo, hash da transacao e indice
coincidem com o evento indexado. Latencia de recibo recuperado nao e inferida.
O intervalo entre data meteorologica passada e transacao atual nao e apresentado
como tempo de liquidacao: apolices historicas vinculadas sao excluidas dessa media.

Caches de download, dados locais e segredos ficam fora do Git. O pacote público INMET acompanha o repositório.


## Banco unico e testes

`npm start` inicia PostgreSQL, aguarda a conexao e inicializa o esquema atual
se o banco estiver vazio. `api/src/banco/esquema.sql` contem apenas o modelo vigente.
Nao existe banco embutido nem transferencia automatica de outro motor.
No uso, o iniciador recusa uma URL que aponte para outro banco. O volume de uso é preservado.

Os testes criam bancos com prefixo aleatorio `agrosmart_teste_` no servidor PostgreSQL
e removem somente os bancos criados pelo proprio helper. Exigem permissao de criar
bancos. Nao usam tabelas ou dados do banco da aplicacao. O ensaio de persistencia
Docker possui projeto e volume temporarios exclusivos, removidos ao terminar.

O recorte comum fica em `configuracao/historico.json`: A770, 01/01/2020 a 30/09/2026,
datas inclusivas UTC. ETL, interface, API e oraculo leem essa configuracao. As constantes
do contrato e as restricoes SQL aplicam o mesmo periodo, conferido pelos testes.
O relogio atual e usado para sessoes, auditoria e transacoes; nunca como medicao climatica.

Nao ha migracoes, tabelas de sensores ou controles de transferencia de versoes retiradas.
