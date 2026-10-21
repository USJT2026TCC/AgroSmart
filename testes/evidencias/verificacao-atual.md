# Verificacao do sistema atual

Execucao: 21/10/2026, apos substituir as migracoes e processos retirados pelo esquema unico.

## Estrutura em uso

- PostgreSQL/PostGIS exclusivo, com 15 tabelas da aplicacao e a extensao espacial.
- `backend/src/banco/esquema.sql` define somente o modelo vigente.
- `backend/src/banco/inicializar.js` cria a estrutura em banco vazio e confere as tabelas em banco existente.
- INMET A770, 01/01/2020 a 30/09/2026; nenhuma medicao climatica atual.
- Sem tabelas de sensores, carga climatica substituida, controle de transferencia ou cadeia de migracoes.
- Documentacao operacional descreve somente o fluxo vigente.

## Execucoes aprovadas

`npm test` concluiu as oito etapas. Saida local: `testes/gerados/verificacao-esquema-atual.txt`.

| Verificacao | Resultado |
|---|---|
| Infraestrutura | 5 testes |
| Contratos, incluindo PostgreSQL/API/oraculo/EVM | 96 testes |
| Analise estatica | Slither: zero achados |
| Backend no esquema atual | 85 testes |
| Indexador | 5 testes de integracao |
| Oraculo | 59 unitarios e 4 integracoes |
| Interface | 60 testes e build aprovado |
| ETL | 14 testes |
| Persistencia Docker separada | 1 teste (`npm run testar:docker`) |

Os testes criam bancos descartaveis isolados, sem alterar os cadastros de uso.
Consultas, propostas e contrato historico recusam datas fora do recorte. Arquivos,
configuracoes e resultados de teste ficam em testes/.

## Limite

A fabrica historica publica na Sepolia ainda precisa de implantacao e verificacao.
Nenhuma transacao publica ou teste manual de MetaMask foi feito nesta verificacao.
