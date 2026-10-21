# Revisao do oraculo historico — 21/10/2026

## Alteracoes

- Comando de servico restrito a apolices historicas A770. Retirado o percurso
  operacional de sensores, fontes e periodo corrente; opcoes antigas sao recusadas.
- API historica entrega descricao e hash dos termos. O oraculo os confere com
  hashTermos e parametros do contrato. Modo integral, datas UTC e gatilho devem coincidir.
- Serie recebida e comparada aos CSVs do pacote publico, cujos hashes sao conferidos
  e vinculados ao conjunto fixado na proposta. Alterar somente os dias no banco
  agora e detectado mesmo se os metadados de importacao permanecerem iguais.
- Campo vazio, booleano, horas fracionarias e chuva acima do limite diario
  coerente com 500 mm/h nao viram dia seco. Publicacao de cobertura incompleta e bloqueada.
- Hash transmitido e salvo na fila antes da espera por confirmacao. Retomada consulta
  o recibo conhecido sem novo envio. Altura atual e consultada por RPC sem cache.
- Gravacao da fila em arquivo temporario e troca de nome; estrutura invalida
  nao vira fila vazia. Interrupcao no limite tem tratamento explicito.
- Falha de auditoria ou relato apos confirmacao nao devolve a transacao para envio.
  Registro local e idempotente; metadados pendentes sao tentados em ciclos posteriores.
- Recibos recuperados apos interrupcao nao entram na media de latencia observada.
- Configuracao, comandos e README atualizados. Fonte simulada existe somente em testes.
  Temporarios das suites do oraculo foram centralizados em testes/gerados/oraculo.

## Verificacoes executadas

| Verificacao | Resultado |
|---|---|
| Unitarios do oraculo, incluindo compatibilidade legada | 99 aprovados |
| Integracao do oraculo em no Hardhat separado | 8 aprovados |
| API + banco + oraculo + contrato historico na EVM local | 1 aprovado |
| Unitarios da API apos ampliar sua resposta historica | 111 aprovados |
| Comparacao somente por leitura do PostgreSQL real com o pacote | 2.465 dias coincidentes |
| Status da aplicacao apos reinicio | API/PostgreSQL, interface, indexador e processo do oraculo ativos |

Comando de cobertura: `npm run cobertura --workspace oraculo`.
Medicao final com c8, incluindo todos os arquivos de src/:

| Metrica | Resultado |
|---|---|
| Linhas/instrucoes | 94,10% (2.012/2.138) |
| Ramos | 85,74% (385/449) |
| Funcoes | 91,20% (83/91) |

Esses numeros incluem codigo de compatibilidade ainda compartilhado com o backend.
Nao medem acuracia meteorologica nem comprovam pagamento na rede publica.

Novos casos incluem termo/hash/estacao divergentes, chuva alterada no banco,
pacote local alterado, cobertura incompleta, primeiro acionamento, ultimo dia
sem acionamento, periodo ja publicado, retomada apos transmitir, falha de disco
apos confirmacao, relato indisponivel, API fora do ar, rede RPC incorreta,
confirmacoes insuficientes, transacao revertida e recusa de opcoes obsoletas.
O teste com publicador real verifica um pagamento historico e recupera o mesmo
recibo; o saldo e consultado no bloco confirmado para nao reutilizar cache de latest.
Os dados sinteticos das suites ficam identificados em testes/oraculo/fixtures.

## Consulta publica somente de leitura

Rede consultada: Sepolia, chainId 11155111. O endereco do oraculo indicado no
manifesto estava autorizado no OracleRegistry. Saldo observado: 0,001996519587908892
ETH de teste. Nenhuma transacao foi enviada nesta revisao; nao se mediu custo
real de publicacao historica na Sepolia.

A aplicacao foi reiniciada apos conferir zero apolices ativas e nenhuma entrada
na fila. A fabrica publica ainda usa clima-integral-v1 e nao emite apolices historicas.

## Limites e pendencias

A fabrica historica ainda precisa ser implantada e verificada na Sepolia, e o
fluxo publico precisa ser testado depois. Os testes desta revisao nao validam MetaMask.
A interface ainda oferece o modo convencional por padrao; para este percurso e
necessario marcar o uso historico. Sua simplificacao fica para a revisao da interface/backend.

consolidador.js e reputacao.js permanecem porque backend e testes anteriores
os importam. Nao sao usados pelo ciclo historico. Nao foram apagados sem retirar
primeiro essas dependencias na revisao correspondente.

Execute apenas um servico por pasta de estado. Uma queda antes do retorno do
hash pelo RPC continua exigindo consulta da cadeia antes de reabrir uma falha.
Nao ha garantia geral de envio exatamente uma vez; o contrato bloqueia periodo
repetido. Hashes detectam divergencia em relacao ao pacote contratado, mas nao
provam verdade meteorologica ou assinatura do INMET. Fonte e operador sao unicos.
