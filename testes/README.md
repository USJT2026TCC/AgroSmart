# Testes

Execute `npm test` na raiz. Esta pasta concentra:

| Pasta | Conteudo |
|---|---|
| contratos | Testes de contrato, contratos de ataque e ferramentas de ensaio |
| backend | Testes da API e integracao do indexador |
| oraculo | Consolidacao, fila, integracao e fontes sinteticas |
| app | Testes de telas e carteira falsa exclusiva de teste |
| simulador | Download, preparacao, cache, lacunas e envio de leituras |
| medicoes | Scripts de desempenho e compatibilidade |
| configuracao | Configuracoes de cobertura, Python e Slither |
| evidencias | Registros de verificacoes anteriores, identificados pela data |
| gerados | Saidas locais de execucao, ignoradas pelo Git |

Fixtures e dados sinteticos nao representam observacoes de campo. Os testes de blockchain iniciam redes locais isoladas; nao usam chaves Sepolia nem a carteira do produtor. O uso do software continua exclusivamente na Sepolia.


O fluxo historico usa dados sinteticos identificados nas fixtures para verificar
datas, inicio da contagem, primeiro acionamento, pagamento unico e ausencia de
duplicacao. `contratos/unitarios/FluxoHistorico.test.js` integra banco real em
memoria, API HTTP, oraculo e EVM local; o envio usa o signatario da EVM de teste.
Os testes do publicador JSON-RPC continuam na suite de integracao do oraculo.
Nenhum desses testes confirma uma liquidacao historica na Sepolia com MetaMask.


`infraestrutura/banco.test.mjs` verifica escolha do servidor, comandos Compose e
falha sem Docker. `npm run testar:docker` executa `infraestrutura/docker.integracao.test.mjs`
contra PostgreSQL/PostGIS real, em projeto/volume exclusivos de teste. Precisa de
Docker disponivel; resultados de bancos em memoria nao substituem essa verificacao.
