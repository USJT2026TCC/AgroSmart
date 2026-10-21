# Testes

Execute `npm test` na raiz. Esta pasta concentra:

| Pasta | Conteudo |
|---|---|
| blockchain | Testes de contrato, contratos de ataque e ferramentas de ensaio |
| api | Testes da API e integracao do indexador |
| oraculo | Serie historica, integridade, fila, publicador e integracao |
| interface | Testes de telas e carteira falsa exclusiva de teste |
| etl | Download, preparacao, cache e lacunas |
| medicoes | Scripts de desempenho e compatibilidade |
| configuracao | Configuracoes de cobertura, Python e Slither |
| evidencias | Resultados das verificacoes automatizadas |
| gerados | Saidas locais de execucao, ignoradas pelo Git |

Fixtures e dados sinteticos nao representam observacoes de campo. Os testes de blockchain iniciam redes locais isoladas; nao usam chaves Sepolia nem a carteira do produtor. O uso do software continua exclusivamente na Sepolia.


O fluxo historico usa dados sinteticos identificados nas fixtures para verificar
datas, inicio da contagem, primeiro acionamento, pagamento unico e ausencia de
duplicacao. `blockchain/unitarios/FluxoHistorico.test.js` integra PostgreSQL/PostGIS descartavel, API HTTP, oraculo e EVM local; o envio usa o signatario da EVM de teste.
Os testes do publicador JSON-RPC continuam na suite de integracao do oraculo.
Nenhum desses testes confirma uma liquidacao historica na Sepolia com MetaMask.


`infraestrutura/banco.test.mjs` verifica escolha do servidor, comandos Compose e
falha sem Docker. `npm run testar:docker` executa `infraestrutura/docker.integracao.test.mjs`
contra PostgreSQL/PostGIS real, em projeto/volume exclusivos de teste. Precisa de
Docker disponivel. Nao existe dependencia de banco embutido.

As suites da API usam `api/fixtures/banco.js`: cria e remove somente bancos
`agrosmart_teste_<identificador aleatorio>` no PostgreSQL. O usuario do servidor
precisa ter permissao CREATE DATABASE. Os dados da aplicacao ficam separados.

Requisitos da suíte completa: dependências npm, Docker/PostgreSQL disponível,
Slither no PATH e `etl/.venv` com `./etl[dev]` instalado. O pytest usa
`testes/configuracao/pytest.ini`, que aponta para o código Python atual.
`infraestrutura/interface.test.mjs` testa o servidor HTTP e o proxy após o build.
