# Roteiro da demonstração com MetaMask e Sepolia

Use o navegador com a extensão MetaMask e a instalação da VM. A carteira do
produtor permanece na extensão; não enviar chaves ou frases de recuperação.
Primeiro confirme a atualização da VM e o endereço da fábrica atual no painel.

| Cenário             | Período e gatilho                   | Resultado esperado                                                               |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| A — pagamento       | 01/06/2024 a 30/06/2024; 10 dias    | Primeira publicação em 10/06/2024, índice 10 e indenização de 0,006 ETH uma vez  |
| B — sem acionamento | 20/01/2024 a 25/01/2024; 10 dias    | Sem indenização; publicação do último dia com índice 2 e resgate pela seguradora |
| C — cancelamento    | Mesmo período de A, em outro talhão | Cancelar antes da primeira publicação e devolver a garantia à seguradora         |

Os resultados esperados de A e B foram conferidos na série preparada e na API.
A confirmação blockchain deve ser registrada durante o ensaio real.

## Cenário A: cadastro até recebimento

1. Seguradora: cadastrar um talhão de soja com identificador de demonstração.
   Registrar a tela com o perfil, produto, período disponível e talhão.
2. Produtor: entrar no perfil João e confirmar que o talhão aparece. Em Minha
   carteira, vincular a conta do produtor assinando a mensagem na MetaMask, caso
   ainda não esteja vinculada nessa instalação. A conta da seguradora é diferente.
3. Produtor: selecionar período e gatilho de A, consultar o histórico e enviar
   a proposta. Capturar o resultado da consulta e a proposta enviada.
4. Seguradora: abrir a proposta e conferir produtor, carteira, talhão, datas,
   gatilho e indenização. Assinar emissão na MetaMask; depois, depositar exatamente
   a garantia de 0,006 ETH na transação seguinte. Registrar os dois hashes.
5. Oráculo: acompanhar a publicação automática. Registrar o índice, a data
   histórica e a situação Liquidada no detalhe da apólice.
6. Etherscan: registrar o recibo bem-sucedido, endereço da apólice, evento de
   pagamento e transferência do valor para o beneficiário. Registrar também o
   recebimento na carteira do produtor. O saldo isolado não comprova qual apólice pagou.
7. Aguardar outra rodada do oráculo e conferir que a mesma apólice não paga outra vez.

## Cenários B e C

B usa outro talhão e o mesmo processo de emissão/garantia. Após a publicação do
último dia, a seguradora executa o resgate pela MetaMask. Conferir a ausência de
pagamento ao produtor e a devolução de 0,006 ETH, separando as taxas de gás.

Para C, o operador deve pausar o serviço `oraculo` antes de depositar a garantia,
para controlar a ordem do ensaio. Depois do cancelamento e do registro da
devolução, retomar o serviço. Não cancelar uma apólice que já recebeu publicação.

## Validações negativas

Conferir que datas fora de 2020–2024 e gatilhos inválidos são recusados. No acesso
pela MetaMask, conferir o bloqueio de conta da seguradora incorreta e de outra
rede. Não confirmar transações quando os termos ou a rede divergirem.

## Registro de cada evidência

Anotar cenário, data/hora, versão/fábrica, ação, resultado esperado, resultado
observado, endereço da apólice, hash da transação e nome do print. Só marcar como
aprovado depois de conferir os recibos. Uma tela de cotação não comprova pagamento;
uma EVM local não comprova execução na Sepolia.

Estado desta execução: cenário A confirmado por recibos, estado do contrato e API.
Captura final liquidada registrada; cenários B e C pendentes.

## Capturas complementares do cenário A

| Local | O que registrar | Situação |
| --- | --- | --- |
| Interface e MetaMask da seguradora | Termos e solicitação de emissão na Sepolia | Registrado em 03 |
| Interface da apólice | Liquidada, valor pago, termos e linha do tempo | Registrado em 05 e 06 |
| Etherscan — Overview | Success, hash, bloco, oráculo e transferência ao produtor | Registrado em 07 |
| Etherscan — Logs | IndicesPublicados, CondicaoAvaliada e PagamentoExecutado | Captura pendente; eventos já conferidos via RPC |
| Etherscan — contrato da apólice | Aba Contract com verificação e Read Contract: situacao, valorPago e periodoAcionador | Captura pendente |
| MetaMask do produtor | Conta beneficiária e rede Sepolia; detalhes do recebimento, se exibidos | Complementar; saldo isolado não prova este pagamento |

A carteira da seguradora aberta ao lado da apólice não representa o recebimento
pelo produtor. Transferências internas podem não aparecer como uma operação
separada na atividade da MetaMask; nesse caso, usar o recibo do Etherscan.
Não registrar chaves privadas, recuperação da carteira, tokens ou configuração secreta.
