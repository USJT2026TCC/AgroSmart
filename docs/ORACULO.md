# Oráculo

O processo é iniciado por `npm start`, junto dos demais serviços. Na operação, usa somente leituras recebidas pela API. Não há geração de cenário sintético no serviço de uso.

## Processamento

1. Consulta à API as apólices ativas e as leituras do talhão.
2. Valida os dados e considera a reputação das fontes.
3. Soma chuva por estação em cada dia e calcula a média entre as estações. Menos de 1 mm conta como dia seco; ausência de dado válido interrompe a sequência.
4. Usa uma janela de até 90 dias, que pode incluir dias anteriores à vigência. A publicação é bloqueada se a consolidação não tiver duas fontes válidas. Isso não significa um quorum independente de duas fontes em cada dia.
5. Persiste a publicação na fila e envia o índice ao contrato com a chave própria do oráculo. Registra recibo e falhas, com tentativas controladas.

A chave do produtor não entra nesse processo. O oráculo é um único serviço autorizado: autenticação de fontes não comprova a verdade física da chuva. A API entrega leituras, não decide o pagamento. Quem paga é a apólice.

## Código

| Arquivo em oraculo/src | Função |
|---|---|
| index.js | Serviço contínuo e comandos operacionais |
| clienteBackend.js | Comunicação autenticada com a API |
| consolidador.js | Regra de chuva e contagem de dias secos |
| reputacao.js | Estado de reputação das fontes |
| fila.js | Persistência, repetição e tratamento de falhas |
| publicador.js | Comunicação e assinatura na blockchain |
| registro.js | Registro das publicações |

As fontes artificiais, a linha de comando de cenários e as verificações ficam exclusivamente em testes/oraculo. Para conferir o conjunto em execução, use `npm run status`.
