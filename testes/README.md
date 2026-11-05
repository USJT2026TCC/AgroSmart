# Testes do AgroSmart

Há três tipos de verificação, com alcances diferentes:

| Tipo | Onde está | Como executar | Alcance |
| --- | --- | --- | --- |
| Suíte automatizada | Pastas de cada componente | `npm test` | Regras e integrações com banco e EVM locais, sem MetaMask nem Sepolia |
| Conferência manual | `conferencia-manual/` | Comandos no README da pasta | Recálculo das apólices A e B e comparação dos cancelamentos |
| Demonstração na Sepolia | `evidencias/validacao-2026-11-03/` | Registro; repetir exige MetaMask | Apólices reais na VM, com capturas e recibos |

## Organização

```text
testes/
├── executar.mjs            sequência do npm test
├── configuracao/           cobertura, Slither, pytest e banco de teste
├── api/
│   ├── unitarios/          rotas e regras da API, com PostgreSQL
│   ├── integracao/         API com pacote INMET, contratos e indexador
│   └── fixtures/           apoio aos testes
├── blockchain/
│   ├── unitarios/          contratos em EVM local e fluxos completos
│   ├── mocks/              contratos maliciosos usados nos ataques
│   └── fixtures/           apoio aos testes
├── oraculo/
│   ├── unitarios/          contagem, fila, publicador e comandos
│   ├── integracao/         oráculo contra um nó local
│   └── fixtures/           apoio aos testes
├── interface/
│   ├── telas/              telas completas de cada perfil
│   ├── *.test.*            lógica sem tela: eventos, datas e atualização
│   └── fixtures/           apoio aos testes
├── etl/                    preparo dos dados do INMET
├── infraestrutura/         banco, scripts, servidor da interface e Docker
├── conferencia-manual/     fora do npm test
├── evidencias/             resultados registrados da validação
└── gerados/                saídas temporárias, fora do Git
```

## O que é testado no fluxo

| Etapa | O que se confere | Testes |
| --- | --- | --- |
| Cadastrar o talhão | A seguradora cadastra e o produtor encontra o talhão | `interface/telas/cadastro-integrado.test.jsx`, `api/unitarios/cadastro.test.js` |
| Simular e solicitar | Datas de 2020–2024, gatilho, carteira e proposta | `interface/telas/cotacao.test.jsx`, `api/unitarios/propostas.test.js` |
| Emitir e garantir | Termos iguais aos da proposta, permissão e depósito exato | `api/integracao/`, `blockchain/unitarios/ApoliceFactory.test.js` |
| Avaliar a chuva | Integridade dos arquivos e contagem dos dias secos | `etl/`, `oraculo/unitarios/historico.test.js` |
| Publicar e pagar | API, banco, oráculo e contrato juntos; pagamento único e retomada | `blockchain/unitarios/FluxoHistorico.test.js`, `oraculo/integracao/` |
| Variar período e gatilho | Série A770 real, com pagamento ou resgate | `blockchain/unitarios/CenariosSafra.test.js` |
| Cancelar e resgatar | Momento permitido, papel autorizado e destino da garantia | `blockchain/unitarios/Cancelamento.test.js` |
| Resistir a ataques | Reentrância e recebedores que recusam ETH | `blockchain/unitarios/Seguranca.test.js` |
| Acompanhar e reiniciar | Eventos, telas, importação sem duplicatas e persistência | `api/integracao/indexador.test.js`, `infraestrutura/` |

## Cenários de safra

`CenariosSafra.test.js` usa a série A770 real, o avaliador do oráculo e um contrato em
EVM local, sem API, interface ou MetaMask. Os resultados não são da Sepolia, e os
gatilhos são experimentais: não validam uma tolerância agronômica da soja.

| Caso | Cobertura | Gatilho | Maior sequência seca | Resultado |
| --- | --- | ---: | ---: | --- |
| S1 | 01–28/02/2022 | 10 | 10 | Publicação em 22/02; pagamento de 0,006 ETH |
| S2 | 01–30/11/2022 | 15 | 23 | Publicação em 15/11; pagamento de 0,006 ETH |
| S3 | 20/02–31/03/2024 | 10 | 9 | Sem pagamento; publicação final e resgate |
| S4 | 20/02–31/03/2024 | 9 | 9 | Publicação em 04/03; pagamento de 0,006 ETH |

## Executar

Na raiz, após `npm ci`, com Docker em execução, Python e Slither disponíveis:

```powershell
python -m venv etl/.venv
./etl/.venv/Scripts/python.exe -m pip install -e "./etl[dev]"
python -m pip install slither-analyzer
npm test
```

No Linux, use `etl/.venv/bin/python`. A conta PostgreSQL precisa criar bancos
descartáveis `agrosmart_teste_<UUID>`; o ensaio Docker usa projeto e volume próprios.

Para rodar só uma parte:

| Comando na raiz | Alcance |
| --- | --- |
| `npm run testar --workspace blockchain` | Contratos e fluxos em EVM local |
| `npm run testar --workspace api` | Rotas e regras da API |
| `npm run testar:integracao --workspace api` | API, pacote INMET, contratos e indexador |
| `npm run testar:tudo --workspace oraculo` | Oráculo, inclusive contra um nó local |
| `npm run testar --workspace interface` | Telas e lógica da interface |
| `npm run testar:docker` | Inicialização e persistência no Docker |
