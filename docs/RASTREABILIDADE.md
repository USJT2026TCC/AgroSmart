# Implementacao atual

| Funcionalidade | Implementacao | Testes em testes/ |
|---|---|---|
| Login e permissoes | backend/src/rotas/autenticacao.js e seguranca/ | backend/unitarios/autenticacao.test.js |
| Carteira | backend/src/rotas/carteira.js | backend/unitarios/carteira.test.js |
| Cadastros e area | backend/src/rotas/cadastro.js | backend/unitarios/cadastro.test.js |
| Cotacao e proposta | backend/src/rotas/propostas.js e dominio/reproducao.js | backend/unitarios/propostas.test.js e reproducao.test.js |
| Banco e importacao | backend/src/banco/esquema.sql e importarInmet.js | backend/unitarios/importacao.test.js |
| ETL INMET | simulador/src/simulador/ | simulador/ |
| Indice e integridade | oraculo/src/historico.js e serieHistorica.js | oraculo/unitarios/historicoServico.test.js |
| Fila e publicacao | oraculo/src/oraculo.js e publicador.js | oraculo/unitarios/ e integracao/ |
| Garantia, pagamento e cancelamento | contratos/contracts/ | contratos/unitarios/ |
| Fluxo completo | API, PostgreSQL, oraculo e EVM | contratos/unitarios/FluxoHistorico.test.js |
| Indexador | backend/src/cadeia/indexador.js | backend/integracao/indexador.test.js |
| Telas | app/src/ | app/telas/ |

`npm test` verifica o projeto. `npm run testar:docker` verifica persistencia Docker.
A fabrica historica publica continua pendente; testes locais nao validam MetaMask ou pagamento Sepolia.
