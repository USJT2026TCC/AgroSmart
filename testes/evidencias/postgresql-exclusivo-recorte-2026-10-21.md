# PostgreSQL exclusivo e recorte historico — 21/10/2026

## Alteracoes verificadas

- Removidas as dependencias do banco embutido do backend, workspace de testes e lockfile; npm prune --ignore-scripts --offline retirou os pacotes instalados sem download.
- Removidos abrirPGlite, emMemoria, transferencia automatica, configuracao e script de transferencia. A conexao operacional exige PostgreSQL.
- Todas as suites com banco agora usam PostgreSQL/PostGIS real. O helper em testes/backend/fixtures/banco.js cria bancos aleatorios agrosmart_teste_<uuid>, sem usar tabelas do banco da aplicacao, e remove somente esses bancos ao fechar.
- O teste Docker usa somente PostgreSQL, verifica importacao idempotente e preservacao de identidades/geometrias ao reabrir conexao; seu projeto e volume temporarios sao removidos.
- Configuracao comum em configuracao/historico.json: A770, 01/01/2020 a 30/09/2026 inclusive UTC. ETL, campos da interface, cotacoes/propostas, avaliador historico e oraculo usam esse recorte.
- Importacao e CHECKs SQL recusam dias fora do recorte. ApoliceHistorica recusa cobertura fora das mesmas datas e gatilho fora de 1 a 366. Testes conferem as constantes Solidity contra a configuracao.
- O relogio atual permanece em sessoes, tentativas, auditoria, recibos e blocos; nao representa medicao meteorologica.
- Atualizados os READMEs operacionais, referencias de arquitetura e instrucoes de HTTPS. A redacao academica anterior foi explicitamente identificada para nao apresentar escopo/resultados antigos como atuais.

## Validacao

Executado npm test na raiz, com termino bem-sucedido das oito etapas. Saida local completa: testes/gerados/verificacao-postgres-recorte.txt (ignorada pelo Git).

| Verificacao | Resultado |
|---|---|
| Infraestrutura | 5 testes passaram |
| Contratos, incluindo fluxo PostgreSQL/API/oraculo/EVM | 96 testes passaram |
| Cobertura Solidity observada | 100% linhas; 91,1% ramos; nao significa ausencia de defeitos |
| Slither | 4 contratos, 102 detectores, zero resultados |
| Backend em PostgreSQL | 86 testes passaram |
| Indexador em PostgreSQL e no blockchain local | 5 testes passaram |
| Oraculo | 59 unitarios e 4 integracoes locais passaram |
| Interface | 60 testes passaram; build concluido |
| ETL sem downloads | 14 testes passaram; cobertura 89,30%; Ruff passou |
| Docker separado (npm run testar:docker) | 1 teste passou; contêiner e volume temporarios removidos |

Fronteiras testadas: rejeicao de 31/12/2019 e 01/10/2026; limites validos 01/01/2020 e 30/09/2026 no avaliador; insercao fora do recorte recusada pelo PostgreSQL; cobertura fora do recorte recusada pelo contrato; ETL recusa outra estacao antes de download.

Foi corrigida tambem uma corrida observada no primeiro inicio de um conteiner novo: a conexao aguarda o PostgreSQL TCP definitivo, repetindo apenas erros transitorios de inicializacao. Erros de credenciais/SQL nao sao tratados como sucesso.

## Banco de uso e servicos

Antes e depois do reinicio: 2 usuarios, 1 carteira vinculada, 2465 dias climaticos. Zero dias fora do recorte e nenhum banco aleatorio de teste restante apos as suites. Migração 011_recorte_historico.sql aplicada; as duas constraints foram conferidas no banco de uso. API /saude respondeu 200; interface, API, indexador e processo do oraculo ativos.

Nao houve exclusao de cadastros, alteracao da serie INMET ou transacao publica. A tabela/migracao antiga de controle de transferencia foi preservada como historico, sem codigo ou dependencia que execute o motor retirado. Registros de verificacoes anteriores nao foram reescritos como resultados atuais.

## Pendente externo a esta verificacao

O codigo Solidity foi atualizado e validado localmente; a fabrica publica Sepolia ainda precisa ser atualizada e verificada. Nenhum contrato implantado foi modificado, nenhuma transacao de pagamento publico foi testada e nenhuma verificacao manual da MetaMask foi feita nesta revisao.
