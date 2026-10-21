# Implementacao atual

| Funcionalidade | Implementacao | Testes em testes/ |
|---|---|---|
| Login e permissoes | api/src/rotas/autenticacao.js e seguranca/ | api/unitarios/autenticacao.test.js |
| Carteira | api/src/rotas/carteira.js | api/unitarios/carteira.test.js |
| Cadastros e area | api/src/rotas/cadastro.js | api/unitarios/cadastro.test.js |
| Cotacao e proposta | api/src/rotas/propostas.js e dominio/reproducao.js | api/unitarios/propostas.test.js e reproducao.test.js |
| Banco e importacao | api/src/banco/esquema.sql e importarInmet.js | api/unitarios/importacao.test.js |
| ETL INMET | etl/src/etl/ | etl/ |
| Indice e integridade | oraculo/src/historico.js e serieHistorica.js | oraculo/unitarios/historicoServico.test.js |
| Fila e publicacao | oraculo/src/oraculo.js e publicador.js | oraculo/unitarios/ e integracao/ |
| Garantia, pagamento e cancelamento | blockchain/contracts/ | blockchain/unitarios/ |
| Fluxo completo | API, PostgreSQL, oraculo e EVM | blockchain/unitarios/FluxoHistorico.test.js |
| Indexador | api/src/cadeia/indexador.js | api/integracao/indexador.test.js |
| Telas | interface/src/ | interface/telas/ |

`npm test` verifica o projeto. `npm run testar:docker` verifica persistencia Docker.
A fábrica histórica está implantada e verificada na Sepolia; testes locais não validam MetaMask ou pagamento público.
