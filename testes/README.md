# Testes do AgroSmart

A validação acompanha o seguro do cadastro do talhão ao pagamento, cancelamento
ou resgate. Há três tipos de verificação, com alcances diferentes:

| Verificação | O que executa | Onde está |
| --- | --- | --- |
| Suíte automatizada | Regras, falhas e integrações com banco e EVM isolados; telas com fronteiras controladas | Pastas dos componentes; comando `npm test` |
| Demonstração com MetaMask | Operações realizadas na VM e confirmadas na Sepolia | `evidencias/validacao-2026-11-03/` |
| Conferência complementar | Recálculo dos registros A e B sem a API/oráculo e diagnóstico de cancelamento em EVM local | `auditoria-externa/`; comandos próprios |

## O que é testado no fluxo

| Etapa | O que se confere | Testes responsáveis |
| --- | --- | --- |
| Cadastrar o talhão | A seguradora cadastra e o produtor encontra o talhão correto | `interface/telas/cadastro-integrado.test.jsx`, API e PostgreSQL |
| Simular e solicitar | Datas de 2020–2024, gatilho, carteira vinculada e proposta por talhão | `interface/telas/`, `api/unitarios/` |
| Emitir e garantir | Termos iguais aos da proposta, permissão e depósito exato | `api/integracao/`, `blockchain/unitarios/` |
| Avaliar a chuva | Integridade dos arquivos, preenchimento registrado e contagem dos dias secos | `etl/`, `oraculo/unitarios/` |
| Publicar e pagar | API, banco, oráculo e contrato em conjunto; pagamento único e retomada | `blockchain/unitarios/FluxoHistorico.test.js`, `oraculo/integracao/` |
| Variar período e gatilho | Série A770 tratada com coberturas mais longas, pagamento ou resgate | `blockchain/unitarios/CenariosSafra.test.js` |
| Cancelar e resgatar | Momento permitido, papel autorizado e destino da garantia | `blockchain/unitarios/Cancelamento.test.js` e demais casos contratuais |
| Acompanhar e reiniciar | Eventos, atualização das telas, importação sem duplicatas e persistência | `api/integracao/indexador.test.js`, `interface/`, `infraestrutura/` |

O cadastro integrado usa interface, API e PostgreSQL reais, com transporte HTTP
adaptado ao teste. `FluxoHistorico` usa dados sintéticos identificados; os cenários
de safra usam o pacote A770 tratado. Ambos executam contratos em EVM local, sem
MetaMask. A comprovação pública do pagamento está nos recibos da Sepolia.

## Casos com a série A770 em EVM local

Os quatro casos de `CenariosSafra.test.js` foram conferidos em 04/11/2026.
Eles executam o avaliador do oráculo e um contrato local, sem API, interface ou
MetaMask. A sequência máxima é calculada sobre todo o período da cobertura.

| Caso | Cobertura | Gatilho | Maior sequência seca | Resultado |
| --- | --- | ---: | ---: | --- |
| S1 | 01–28/02/2022 | 10 | 10 | Publicação em 22/02; pagamento de 0,006 ETH locais |
| S2 | 01–30/11/2022 | 15 | 23 | Publicação em 15/11; pagamento de 0,006 ETH locais |
| S3 | 20/02–31/03/2024 | 10 | 9 | Sem pagamento; publicação final e resgate da garantia |
| S4 | 20/02–31/03/2024 | 9 | 9 | Publicação em 04/03; pagamento de 0,006 ETH locais |

S3 e S4 usam os mesmos dados e mudam apenas o gatilho. São parâmetros
experimentais; esses resultados não validam uma tolerância agronômica da soja.

## Executar a suíte

Na raiz, após `npm ci`, com Docker em execução, Python e Slither disponíveis:

```powershell
python -m venv etl/.venv
./etl/.venv/Scripts/python.exe -m pip install -e "./etl[dev]"
python -m pip install slither-analyzer
npm test
```

No Linux, use `etl/.venv/bin/python` para instalar as dependências do ETL. O runner
seleciona esse executável automaticamente. A conta PostgreSQL precisa criar bancos
descartáveis `agrosmart_teste_<UUID>`; o ensaio Docker usa projeto e volume próprios.

`npm test` executa cobertura dos contratos, Slither, API, integração da API, oráculo,
interface, build, infraestrutura e ETL. Não abre a MetaMask nem envia transações à
Sepolia. Saídas e temporários ficam em `gerados/`, ignorado pelo Git.

Para uma verificação específica:

| Comando na raiz | Alcance |
| --- | --- |
| `npm run testar --workspace blockchain` | Todos os testes contratuais, incluindo os fluxos integrados e de safra |
| `npm run testar:integracao --workspace api` | API, PostgreSQL, pacote INMET e indexador |
| `npm run cobertura --workspace oraculo` | Regras, fila e publicador |
| `npm run cobertura --workspace interface` | Telas e cadastro integrado |
| `npm run testar:docker` | Inicialização e persistência no Docker |

## Ler as evidências

Em `evidencias/validacao-2026-11-03/`, o README apresenta os resultados e o roteiro
de repetição. `prints/` contém as capturas numeradas; `registros/` contém recibos,
consultas e medições. O cadastro local e as apólices da VM são ensaios distintos.

Os 353 testes do relatório correspondem à execução consolidada de 03/11/2026.
Os quatro casos de safra foram acrescentados depois e não são resultados da
Sepolia nem uma nova medição da cobertura consolidada. A contagem de uma nova
execução deve vir da respectiva saída, sem somar rodadas repetidas.
