# Testes do AgroSmart

O foco é verificar o caminho do usuário: a seguradora cadastra o talhão, o produtor
solicita o seguro, a seguradora emite e deposita a garantia, e o oráculo informa o
índice para o contrato pagar ou permitir o encerramento. Os testes de regras
internas complementam esse fluxo, verificando permissões, limites e falhas.

## Fluxos funcionais

| Fluxo | O que é conferido | Onde está |
| --- | --- | --- |
| Cadastro → solicitação → seguradora | Cadastrar dois talhões, entrar como produtor, enviar uma proposta e reencontrá-la no perfil da seguradora, com as datas e o gatilho escolhidos | `interface/telas/cadastro-integrado.test.jsx` |
| Preparar → emitir | Valor, beneficiário, talhão, cultura, hash, datas e gatilho correspondem à proposta; emissão divergente é recusada | `api/integracao/`, `api/unitarios/propostas.test.js` |
| Dados → oráculo → pagamento | Consultar a série pela API, calcular o acionamento, transferir o valor integral e gravar o relato na API sem duplicação | `blockchain/unitarios/FluxoHistorico.test.js` |
| Período e gatilho → desfecho | Usar a série tratada A770 e conferir cenários com pagamento e sem acionamento, incluindo o resgate | `blockchain/unitarios/CenariosSafra.test.js` |
| Cancelar | Antes da primeira publicação, cancelar sem garantia ou devolver a garantia depositada; depois disso, recusar | `blockchain/unitarios/Cancelamento.test.js` |
| Blockchain → acompanhamento | Indexar emissão, garantia, pagamento e cancelamento, atualizar o banco e não duplicar notificações ao reprocessar | `api/integracao/indexador.test.js` |
| Reiniciar → continuar | Preservar dados do PostgreSQL, importar sem duplicação e retomar fila e relatos do oráculo | `infraestrutura/`, `oraculo/unitarios/retomadaEComandos.test.js` |

O cadastro usa React em navegador simulado, API e PostgreSQL reais; o transporte
HTTP é adaptado. O pagamento integrado usa API, PostgreSQL, serviço do oráculo e
EVM local, com uma série pequena criada para o teste. Seu publicador adapta a
chamada ao contrato local; o indexador é verificado em outra suíte. Esses testes
não abrem a MetaMask nem comprovam uma transação na Sepolia.

### Cenários com a série A770

O teste de safra usa os arquivos tratados do INMET, o avaliador do oráculo e o
contrato em EVM local, sem API ou interface. Os gatilhos são experimentais; os
resultados não validam tolerância agronômica da soja.

| Caso | Cobertura | Gatilho | Maior sequência seca | Resultado |
| --- | --- | ---: | ---: | --- |
| S1 | 01–28/02/2022 | 10 | 10 | Acionamento em 22/02; pagamento de 0,006 ETH |
| S2 | 01–30/11/2022 | 15 | 23 | Acionamento em 15/11; pagamento de 0,006 ETH |
| S3 | 20/02–31/03/2024 | 10 | 9 | Sem acionamento; publicação final e resgate |
| S4 | 20/02–31/03/2024 | 9 | 9 | Acionamento em 04/03; pagamento de 0,006 ETH |

## Evidências do sistema na Sepolia

`evidencias/validacao-2026-11-03/` contém um relatório com os quatro desfechos:
pagamento, encerramento com resgate e cancelamentos sem e com garantia.
`prints/` reúne as telas; `registros/` reúne recibos, eventos e consultas salvas.
As capturas mostram a interação e os registros permitem conferir os valores,
destinatários e estados dos contratos. São execuções registradas, não testes
repetidos automaticamente por `npm test`.

## Organização e verificações de apoio

| Pasta | Conteúdo |
| --- | --- |
| `api/`, `oraculo/`, `blockchain/`, `interface/` | Suítes por componente, incluindo os fluxos acima e suas fixtures |
| `etl/` | Extração, validação, consolidação e preenchimento documentado dos dados |
| `infraestrutura/` | Banco, scripts de inicialização, servidor da interface e persistência Docker |
| `configuracao/` | Configurações de cobertura, Slither, pytest e Docker dos testes |
| `conferencia-manual/` | Recálculo separado das decisões salvas e diagnóstico de cancelamento; fora da suíte automática |
| `gerados/` | Arquivos temporários e cobertura, fora do Git |

Os testes de apoio verificam acesso por perfil, assinatura da carteira, integridade
da série, datas, gatilhos, rejeição de publicação não autorizada ou repetida,
reentrância e falhas de transferência. Eles ajudam a explicar **por que** o fluxo
aceita ou recusa uma ação; não substituem a demonstração integrada.

## Reproduzir

Na raiz, com as dependências npm instaladas, Docker em execução, o ambiente
`etl/.venv` com `etl[dev]` e Slither disponível no PATH:

```bash
npm test
```

Na primeira instalação, prepare as dependências de teste:

```bash
npm ci
python -m venv etl/.venv
./etl/.venv/Scripts/python.exe -m pip install -e "./etl[dev]"
python -m pip install slither-analyzer
```

No Linux, use `etl/.venv/bin/python`. A conta PostgreSQL precisa poder criar os
bancos descartáveis `agrosmart_teste_<UUID>`. O ensaio de persistência Docker usa
projeto e volume próprios; a suíte não publica transações na Sepolia.

## Verificação de 05/11/2026

A suíte completa aprovou 357 testes: 93 de contratos e fluxos, 2 de configuração
da implantação, 75 da API, 12 de integração da API, 55 do oráculo, 76 da interface,
18 de infraestrutura e 26 do ETL. O build da interface concluiu e o Slither não
reportou achados na configuração utilizada. Após ampliar os fluxos de cadastro
até a proposta e de pagamento até o relato à API, ambos foram reexecutados e
aprovados. Não foram feitas novas transações na Sepolia nesta revisão.

Esses resultados verificam os cenários exercitados; não constituem auditoria de
segurança nem garantia de ausência de defeitos.
