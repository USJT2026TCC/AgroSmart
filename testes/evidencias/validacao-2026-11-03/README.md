# Validação do AgroSmart — 03/11/2026

**Resultado:** 349 testes distintos aprovados e build da interface concluído.
A validação automatizada foi executada localmente. A demonstração com MetaMask
na VM confirmou o cenário A de pagamento e o cenário B sem acionamento com
resgate da garantia; o cenário C de cancelamento ainda está pendente.

## Execução

Ambiente: Node.js 24.19.0, npm 11.17.0, Python 3.12.10 e PostgreSQL 16 no Docker,
em Windows. Comandos: `npm test` e a verificação da configuração de implantação
agora incluída no mesmo runner. A suíte também passou sem a instalação auxiliar
de dependências que existia dentro de `testes/`.

| Grupo                                                    | Aprovados |
| -------------------------------------------------------- | --------: |
| Contratos Solidity, incluindo integração API–oráculo–EVM |        89 |
| Configuração de implantação                              |         2 |
| API                                                      |        75 |
| Integração da API, banco, pacote INMET e indexador       |        10 |
| Oráculo                                                  |        51 |
| Publicador do oráculo com JSON-RPC em EVM local          |         4 |
| Interface                                                |        74 |
| Infraestrutura, persistência Docker e proxy              |        18 |
| ETL                                                      |        26 |

Os quatro testes de banco repetidos pelo runner são contados uma vez no grupo
infraestrutura. Nos logs, espaços finais foram removidos e linhas separadoras
receberam um prefixo; resultados e mensagens foram preservados. Os logs completos são [execucao.log](execucao.log) e
[configuracao.log](configuracao.log); os dados estruturados estão em [resumo.json](resumo.json).

## Cobertura e análise estática

| Componente | Linhas |  Ramos |
| ---------- | -----: | -----: |
| Contratos  | 99,12% | 92,19% |
| API        | 76,07% | 78,01% |
| Oráculo    |  93,7% | 84,96% |
| Interface  | 90,08% | 80,13% |

O ETL alcançou **90,69% das instruções**, incluindo `__main__.py`. As medições de
API e oráculo incluem `src/`; a interface exclui a entrada `main.jsx` e o JSON de
endereços, conforme sua configuração. Não há afirmação de cobertura total.

O Slither 0.11.6 analisou três contratos com 102 detectores: **zero achados** na
configuração executada. Dependências são filtradas e as fontes têm supressões
pontuais (`timestamp`, `incorrect-equality`, `low-level-calls` e
`arbitrary-send-eth`). Esse resultado não substitui auditoria de segurança.
As fontes Solidity permanecem iguais às da tag `sepolia-2026-11-03`.

## Resultados funcionais

- ETL e carga: os 1.827 dias de 2020–2024 estão utilizáveis no recorte consultado;
  nova importação não duplica registros. A origem e os seis dias preenchidos
  continuam identificados no manifesto da série derivada.
- API: perfis e carteira são validados; emissão com termos divergentes é recusada;
  a indenização usa o valor exato configurado, sem aceitar substituição pelo cliente.
- Contratos: depósito, autorização, pagamento integral único, cancelamento,
  devolução, resgate e tentativas de reentrância foram exercitados em EVM local.
- Oráculo: divergência entre série, hash e termos é recusada; filas, retomada,
  falhas de rede e recuperação de recibo foram verificadas sem pagamento duplicado.
- Interface: cadastro da seguradora aparece para o produtor; datas iniciais e
  cartão do produto respeitam 2020–2024. As duas referências a 2025/2026 encontradas
  nessas telas foram corrigidas. Testes de interface identificam as fronteiras
  simuladas; o teste de cadastro integrado usa API e PostgreSQL reais.
- Docker: os quatro serviços locais iniciaram e responderam; o ensaio de
  persistência usa volume isolado e preserva identidades e cadastros.

Duas consultas à API operacional, registradas em [consultas-reais.json](consultas-reais.json),
confirmaram: de 01 a 30/06/2024, gatilho 10 atinge em **10/06/2024**, com sequência
máxima de 30 dias; de 20 a 25/01/2024, a sequência máxima é de dois dias e o mesmo
gatilho não é atingido. Ambas são consultas; não enviaram transação nem indenização.

As capturas locais documentam a tela e o cadastro do talhão
`tcc-20261103-liquidacao`, criado para esta verificação. Não são prints de pagamento.

## Pendências e limites

A consulta de saúde da VM em 03/11/2026 confirmou PostgreSQL ativo, fábrica
`0x2a9b6995cf920A70B96f4cfC3Ec951BDfeC0f834` e indexador ativo sem erro
na resposta. O registro está em `saude-vm.json`. Essa observação não comprova
liquidação, sincronização até o último bloco nem disponibilidade contínua do RPC.
O roteiro define os cenários de transação ainda pendentes.
### Cenário A — pagamento confirmado na Sepolia

Apólice `0xbf75c995d3a66b42f333f2a17f1768005a07f297`, talhão `talhao-alunos`:
01 a 30/06/2024, gatilho 10 dias, indenização 0,006 ETH. Consulta direta por
JSON-RPC e conferência na API estão em `cenario-a-sepolia.json` e `cenario-a-api.json`.

| Etapa | Bloco | Transação |
| --- | ---: | --- |
| Emissão | 12058483 | [Recibo](https://sepolia.etherscan.io/tx/0x07408fa684da92eb48a795004fea29f791c0e490b5efaaec1688fb877be83e54) |
| Garantia | 12058495 | [Recibo](https://sepolia.etherscan.io/tx/0x384d83d2ee2795f613860289e61b040b190d199e7e4b0d98ffb61aa33eaf7fa2) |
| Índice e pagamento | 12058498 | [Recibo](https://sepolia.etherscan.io/tx/0x7b0dc68351b0a0178746800e0949a56da198df949770ebec92a94d8b10a8dc70) |

Os três recibos tiveram status 1. A última transação, enviada pelo oráculo,
registrou índice 10 no período 20240610, condição atendida e pagamento de
6.000.000.000.000.000 wei ao produtor. A leitura no bloco 12058508 retornou
situação 2 (Liquidada), valor pago 0,006 ETH e saldo zero. A varredura dos eventos
da apólice desde a emissão até esse bloco encontrou um pagamento.
Os termos lidos do contrato coincidiram com datas, gatilho, valor e hash informados.

A API também retornou Liquidada, mesmo valor pago e `confirmada_na_cadeia: true`.
O selo anterior de não confirmação já não corresponde ao registro consultado;
o usuário deve atualizar a tela. Os 9.536 ms são a latência relatada pelo serviço,
não uma medição independente. Entre os blocos de depósito e pagamento decorreram
36 segundos pelos timestamps da cadeia; esta é uma observação, sem média ou p95.

As capturas enviadas pelo usuário foram preservadas: `03-emissao-metamask.png`
mostra a solicitação de assinatura; `04-painel-antes-garantia.png` mostra a apólice
ainda aguardando garantia. As apólices antigas do painel não são resultados deste
cenário. `05-apolice-liquidada.png` mostra situação Liquidada, valor pago de
0,006 ETH, garantia retida zero e um período publicado.
`06-termos-e-linha-do-tempo.png` mostra a coincidência dos hashes dos termos e
a sequência de emissão, garantia, publicação, avaliação e pagamento. O cenário A
está documentado com recibos, estado do contrato, API e capturas da interface.
A MetaMask aberta nos prints é a da seguradora; ela não é prova do saldo do produtor.
`07-etherscan-pagamento.png` mostra Success, hash, bloco, remetente oráculo e
transferência interna de 0,006 ETH da apólice ao produtor. O campo Value de
0 ETH corresponde ao valor enviado pelo oráculo na chamada; não é o valor
da indenização transferida pelo contrato.
As capturas adicionais completam a documentação visual do pagamento:
`08-etherscan-eventos.png` mostra PagamentoExecutado decodificado e os demais
logs; os dois primeiros eventos aparecem em hexadecimal e foram decodificados
na consulta RPC registrada. `09-apolice-sem-verificacao-fonte.png` mostra que o
código-fonte da apólice individual ainda não está verificado no explorador.
`10-fabrica-read-contract.png` mostra a fábrica verificada, seu registro e sua
seguradora; essa verificação não comprova a verificação individual da apólice.
`11-carteira-produtor-interface.png` mostra a conta vinculada, saldo de 0,038 ETH
e 0,018 ETH acumulados em três apólices. Esses totais incluem outros pagamentos;
a evidência específica de 0,006 ETH deste cenário permanece o recibo e seus eventos.
A captura é da interface do AgroSmart, não da extensão MetaMask.

Não faltam capturas obrigatórias para comprovar o pagamento deste cenário.
A verificação individual do código-fonte é uma pendência distinta da execução
confirmada; não foi realizada nesta etapa.
### Cenário B — sem acionamento e garantia resgatada

O ensaio executado usou **20 a 21/02/2024**, com gatilho 10 dias, no lugar
do período de janeiro inicialmente proposto. A apólice é
`0x8f0e008604d8e119613f318c6ed7f365a12f83d7`, do talhão `talhao-alunos`.
As evidências estão em `cenario-b-sepolia.json`, `cenario-b-api.json` e nas
capturas 12 a 14. Foram selecionadas três capturas com termos, garantia e
resultado; as demais capturas fornecidas repetiam etapas ou painéis gerais.

| Etapa | Bloco | Hash |
| --- | ---: | --- |
| Emissão | 12058709 | `0x49915e39ef3e84bce17bb5f8b7e56f5c90b52c6fa79226414c66f12a3981d62d` |
| Garantia | 12058715 | `0xc026f2e7d260e6b45d6592b7c329aff280c6e377b2f653adbf677e73fd027a6a` |
| Índice sem acionamento | 12058718 | `0xa983a9406886ad6a1da69bba8d544e070a8b64af23bffc2006f54628d319347a` |

Os três recibos tiveram status 1. O oráculo publicou período 20240221, índice
zero e condição não atendida. No bloco 12058729, a apólice estava Ativa, com
saldo 0,006 ETH, valor pago zero e nenhum evento PagamentoExecutado desde a
emissão. A API confirmou os mesmos eventos e a publicação na cadeia.
Uma chamada `eth_call` de resgatarGarantia, com remetente seguradora, concluiu
sem reversão naquele bloco; ela não envia transação nem movimenta fundos.
O resgate real foi confirmado depois pela transação
[`0xd72aa6afbe93272d86a9e0b58f2798265d1830f39da8565fbb8363388da16a84`](https://sepolia.etherscan.io/tx/0xd72aa6afbe93272d86a9e0b58f2798265d1830f39da8565fbb8363388da16a84),
status 1, bloco 12058746, em 03/11/2026 às 21:06:12 (UTC−3).
O evento GarantiaResgatada identifica a seguradora e o valor de
6.000.000.000.000.000 wei. A taxa dessa transação foi 0,00000045232067848 ETH,
paga separadamente pela seguradora.

A leitura no bloco 12058759 retornou situação 3 (Encerrada), saldo zero,
valor pago ao produtor zero e nenhum evento PagamentoExecutado desde a emissão.
A API também retornou Encerrada e o evento de resgate com o mesmo hash e valor.
Os registros finais estão em `cenario-b-resgate-sepolia.json` e
`cenario-b-resgate-api.json`. As capturas 15 a 18 mostram a disponibilidade do
resgate, o envio da transação, a apólice encerrada e a linha do tempo com devolução.
`19-etherscan-resgate-garantia.png` complementa as capturas da interface com
status Success, hash, bloco e transferência interna de 0,006 ETH da apólice à
seguradora. O cenário B está concluído para o período efetivamente utilizado;
não são necessárias capturas adicionais para comprovar essa devolução.

Este período tem dois dias e gatilho dez; portanto não poderia atingir o
limiar, mesmo se os dois dias fossem secos. Ele exercita o caminho sem pagamento
e a liberação para resgate; não mede discriminação entre episódios longos com
chuva e seca. O resultado de índice zero é o observado no contrato.
Cenário C (cancelamento) permanece pendente.

O gatilho é experimental e não mede prejuízo agrícola. O contrato confia no
índice enviado pelo oráculo autorizado. O pagamento direto reverte se o
beneficiário for um contrato que rejeita ETH; a suíte confirma essa limitação,
sem implementar saque alternativo. Os testes aprovados e a cobertura não provam
ausência de defeitos.
