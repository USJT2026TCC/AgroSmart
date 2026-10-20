# Backend

API do AgroSmart em Node.js + Express, sobre PostgreSQL com PostGIS.

```
src/
├── index.js            ponto de entrada: banco, migracoes, semente, indexador, porta
├── app.js              aplicacao Express, montada com as dependencias injetadas
├── config.js           configuracao; segredos so por variavel de ambiente
├── banco/              conexao PostgreSQL/PostGIS, migracoes, dados de demonstracao
├── seguranca/          bcrypt, TOTP, cifra em repouso, sessoes, perfis, auditoria
├── cadeia/             leitura da blockchain e indexador de eventos
├── dominio/            cotacao em BigInt, termos e resumo, assinatura de lote, geometria
└── rotas/              uma por area da API
```

## Rodar

Na raiz do projeto, com Docker Desktop aberto e a configuracao Sepolia pronta:

```powershell
npm ci
npm start
```

Interface: http://localhost:5173. API: http://localhost:3001/api.
O banco de uso e somente PostgreSQL/PostGIS no Docker. O inicio aplica migracoes
e importa automaticamente o pacote publico INMET; o volume preserva os dados.
O backend exige DATABASE_URL quando executado separadamente. Nao cria banco
PGlite como alternativa. Testes isolados usam banco temporario em memoria.

Usuarios de demonstracao: `produtor` e `seguradora`, senha `agrosmart`.
O indexador acompanha a implantacao Sepolia configurada; rede local e usada
somente nos testes. `npm run status` verifica os servicos e `npm stop` encerra a aplicacao.

Os testes e suas configuracoes ficam em `testes/`. Na raiz, `npm test` executa
as suites e `npm run testar:docker` verifica a integracao real PostgreSQL/PostGIS.

## Configuracao

Segredos ficam somente no ambiente ou em .env ignorado pelo Git.
`DATABASE_URL` permite usar um PostgreSQL externo com PostGIS.
Em producao (`NODE_ENV=producao`), CHAVE_DE_SERVICO e SEGREDO_DE_CIFRA sao obrigatorios.

## Documentacao

- [docs/BACKEND.md](../docs/BACKEND.md) — arquitetura, rota por rota, e as decisoes
- [docs/ARQUITETURA.md](../docs/ARQUITETURA.md) — onde o backend fica em relacao a fronteira
