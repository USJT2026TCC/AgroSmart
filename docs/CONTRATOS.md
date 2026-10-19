# Contratos da versão climática integral

Protocolo `clima-integral-v1`. Especificação operacional em [ESCOPO-ATUAL.md](ESCOPO-ATUAL.md).

## Responsabilidades

`OracleRegistry` mantém endereços autorizados; apenas a seguradora administra a lista.
`ApoliceFactory` cria uma apólice por contratação, restrita à seguradora e com o
registro oficial. `ApolicePolicy` recebe garantia, valida publicações e liquida.
Nenhum contrato processa fotografias, calcula dano agrícola ou consulta uma API.

## Regra e estados

`AGUARDANDO_GARANTIA → ATIVA → LIQUIDADA` quando há acionamento.
Sem acionamento, após a vigência, o resgate leva de `ATIVA` a `ENCERRADA`.
Antes da vigência, produtor ou seguradora podem levar a apólice a `CANCELADA`.

Garantia exata = limite de indenização. A publicação exige apólice ativa, relógio
do bloco dentro da vigência, oráculo autorizado e período ainda não publicado.
O contrato avalia `indiceClimatico >= limiarClimatico`. Abaixo: 0%; no limiar ou
acima: 100% em parcela única. Não recebe nova publicação depois de liquidado.

`simularPercentual` devolve 0 ou 10000. A cotação usa a réplica JavaScript,
comparada com Solidity nos testes de equivalência. Os campos legados de ABI
`modoPagamento` e `limiarClimaticoIntegral` devem ser 0; o construtor recusa outros
valores. Não existe função de interpolação nesta versão.

O pagamento usa verificar-efeitos-interação e guarda de reentrância. Se o destino
recusar ETH, toda a transação reverte, inclusive registros e eventos. O destino
é fixado no construtor. Eventual ETH forçado por terceiros pode ser recuperado
pela seguradora após liquidação; isso não é indenização parcial.

## Garantia e cancelamento

`cancelar()` é permitido às partes apenas antes da vigência. Passa a CANCELADA e
devolve o saldo à seguradora na mesma transação. Falha da transferência reverte
tudo. Após vigência encerrada sem acionamento, a seguradora usa `resgatarGarantia`.
O contrato não cobra prêmio nem comprova quitação comercial.

## Índice e confiança

O índice é dias consecutivos com chuva consolidada abaixo de 1 mm. O cálculo é
externo, e o limiar é experimental. A assinatura identifica o remetente; não prova
veracidade física. O registro na cadeia contém período, remetente, índice e instante.
Para reexecutar a consolidação, preservar leituras, configuração e logs fora da cadeia.

## Verificação reproduzível

Dentro de `contratos/`: `npm run testar`, `npx hardhat coverage`, `npm run analisar`
e `npx hardhat run scripts/avaliar-integral.js`. Não executar análise estática e
integrações em paralelo: a ferramenta limpa/recompila artefatos compartilhados.

Nesta revisão: 90 testes, 100% de ramos, linhas, funções e instruções na cobertura
dos três arquivos de produção. Slither: zero alertas remanescentes com as supressões
justificadas no código; consultar a [triagem](ANALISE-ESTATICA.md). Isso não é prova
de ausência de vulnerabilidades. [Gas e resultado local](resultados/clima-integral-2026-10-16/README.md).

## Rede pública

Os endereços antigos da Sepolia permanecem como evidências históricas, marcados como
legados. Não operam com a ABI atual. Reimplantar com `npm run implantar:sepolia`,
verificar registro, fábrica e apólice no explorador e repetir os cenários antes de
afirmar que este release foi validado publicamente. Nenhuma chave ou .env é versionado.
