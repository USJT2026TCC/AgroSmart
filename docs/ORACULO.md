# Oráculo

Referência operacional e arquivos: [README do módulo](../oraculo/README.md).

Fluxo atual: PostgreSQL → API autenticada → conferência dos termos e do pacote
INMET → cálculo da estiagem → fila persistente → contrato → recibo e relato.
A770 é a única estação; cobertura e datas são históricas. O índice começa em zero
no início da cobertura. A primeira data acionadora é preservada, mesmo se chover
depois. Sem acionamento, publica-se o último dia. Cobertura incompleta é recusada.

A API entrega também a descrição e o hash dos termos. O oráculo confere esses
compromissos com a apólice e compara os dias recebidos aos arquivos públicos
cujo conjunto de hashes integra a contratação. Isso detecta divergência entre
banco, pacote e termos; não atesta a verdade das medições nem cria uma fonte
descentralizada. O pacote deve acompanhar a mesma revisão do sistema.

A fila guarda o hash transmitido para retomar a confirmação. Após confirmação,
falhas de registro ou relato ficam pendentes sem provocar outra transferência.
A auditoria local é idempotente por apólice, período e hash da transação. Uma
interrupção anterior ao retorno do hash pelo RPC exige conferir a cadeia antes
de reabrir uma falha. Execute somente um serviço por diretório de estado.

`consolidador.js`, `reputacao.js`, os métodos de sensores e suas rotas na API foram
removidos. A fila continua recusando entradas antigas de sensores para impedir
que estado persistido do protocolo anterior seja publicado pelo serviço histórico.

O bloco e os recibos continuam com suas datas atuais. O contrato histórico
interpreta a cobertura hipotética e continua responsável por autorização,
garantia e pagamento. A implantação pública dessa fábrica está pendente;
esta revisão não modifica contratos implantados nem comprova pagamento na Sepolia.

A interface usa contratacao historica. O backend recusa novas propostas convencionais;
o servico ignora apolices convencionais antigas e bloqueia entradas de sensores.
