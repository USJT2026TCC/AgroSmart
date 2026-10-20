# Testes

Execute `npm test` na raiz. Esta pasta concentra:

| Pasta | Conteudo |
|---|---|
| contratos | Testes de contrato, contratos de ataque e ferramentas de ensaio |
| backend | Testes da API e integracao do indexador |
| oraculo | Consolidacao, fila, integracao e fontes sinteticas |
| app | Testes de telas e carteira falsa exclusiva de teste |
| simulador | Testes Python do envio de leituras |
| medicoes | Scripts de desempenho e compatibilidade |
| configuracao | Configuracoes de cobertura, Python e Slither |
| evidencias | Registros de verificacoes anteriores, identificados pela data |
| gerados | Saidas locais de execucao, ignoradas pelo Git |

Fixtures e dados sinteticos nao representam observacoes de campo. Os testes de blockchain iniciam redes locais isoladas; nao usam chaves Sepolia nem a carteira do produtor. O uso do software continua exclusivamente na Sepolia.
