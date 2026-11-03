# Validação do AgroSmart — 03/11/2026

**Resultado:** 349 testes distintos aprovados e build da interface concluído.
A validação automatizada foi executada localmente. A demonstração com MetaMask
na VM ainda depende da execução dos cenários abaixo com confirmação na carteira.

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
**Nenhuma nova emissão, garantia ou liquidação Sepolia é declarada como realizada
nesta execução.**

O gatilho é experimental e não mede prejuízo agrícola. O contrato confia no
índice enviado pelo oráculo autorizado. O pagamento direto reverte se o
beneficiário for um contrato que rejeita ETH; a suíte confirma essa limitação,
sem implementar saque alternativo. Os testes aprovados e a cobertura não provam
ausência de defeitos.
