# Revisao do backend historico — 21/10/2026

## Alteracoes

- Removidos POST /leituras, GET/POST/PATCH /fontes e GET /oraculo/leituras.
- Removidos assinatura de lote, validacao/reputacao de sensores, consolidador e reputacao do oraculo, ferramentas e testes exclusivos do percurso retirado.
- Removidos o CSV antigo de cotacao, sua carga automatica e o calculo de frequencia entre estacoes. A serie atual permanece em backend/recursos/inmet/A770 e inmet_dias.
- Novas propostas exigem reproducao historica e periodo/gatilho explicitos. A interface usa esse modo. Propostas convencionais antigas nao podem ser preparadas; registros permanecem consultaveis.
- A confirmacao dos relatos confronta apolice, periodo, hash da transacao e indice, tanto se o indexador encontrar o evento antes quanto depois do relato.
- Datas/custos invalidos recebem 400. Cadastro de talhao confere se a propriedade pertence ao produtor informado.
- Periodo meteorologico historico nao entra na media de demora ate liquidacao das apolices historicas vinculadas. Recibos recuperados nao recebem uma latencia original inventada.
- Configuracao de uso aponta para Sepolia, sem RPC localhost implicito. NODE_ENV aceita production e producao para as restricoes de producao.

Nao houve alteracao de contrato Solidity, migracao destrutiva ou exclusao de dados do banco de uso. Migracoes antigas permanecem por compatibilidade com bancos existentes; nao representam funcionalidades de sensores ainda ativas.

## Execucoes

| Verificacao | Como | Resultado |
|---|---|---|
| Backend | Dentro de backend/: npm run cobertura | 87 testes passaram; linhas 76,11% (3372/4430), ramos 78,43%, funcoes 84,68% |
| Indexador | Dentro de backend/: npm run testar:integracao | 5 testes passaram em no Hardhat separado |
| Oraculo | Dentro de oraculo/: npm run cobertura; unitarios novamente apos atualizar fixtures | 58 unitarios e 4 integracoes locais passaram; linhas 90,97%, ramos 83,18%, funcoes 88,88% |
| Fluxo historico completo | Dentro de contratos/: npx hardhat --config ../testes/contratos/hardhat.config.cjs test ../testes/contratos/unitarios/FluxoHistorico.test.js | 1 teste passou: API, PGlite/PostGIS em memoria, oraculo e pagamento integral em EVM local |
| Interface | Dentro de app/: npm run testar; npm run build | 60 testes passaram; build concluido |

Regressoes importantes: ausencia das rotas antigas; recusa de contratacao convencional; carteira e perfis; termos historicos UTC; propriedade de outro produtor recusada; datas invalidas; relato com hash ou indice divergente nao confirmado; recibo recuperado sem latencia; preservacao de importacao idempotente. Os testes de sensores e seus numeros anteriores nao entram nos totais atuais.

O teste do indexador usa eventos e recibos de contratos locais reais. Parte desses testes conserva apolices convencionais para verificar leitura de eventos existentes, sem reabrir o caminho de contratacao convencional na API. Fixtures sinteticas estao identificadas e nao sao medicoes do INMET.

## Servicos locais

Antes do reinicio: 2 usuarios, 1 carteira vinculada, 2465 dias em inmet_dias, zero apolices ativas e nenhuma fila pendente na instancia. Reinicio feito com npm stop e npm start, preservando PostgreSQL.

Apos o reinicio: API /saude respondeu 200 com motor postgres e indexador ativo; GET /fontes e POST /leituras responderam 404; /historico/disponibilidade sem login respondeu 401. npm run status confirmou API, banco, rede 11155111, indexador e processo do oraculo ativos.

Interface: http://localhost:5173. API: http://localhost:3001/api.

## Limite desta verificacao

Nao houve transacao publica, teste manual de MetaMask ou implantacao da fabrica historica nesta revisao. A fabrica Sepolia atual continua v1 e a emissao historica permanece bloqueada. Testes locais e cobertura nao comprovam liquidacao publica da nova versao nem ausencia de todos os defeitos.
