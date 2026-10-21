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

`consolidador.js`, `reputacao.js` e os métodos correspondentes permanecem porque
a API legada e testes existentes ainda dependem deles. O comando `servico` não
usa esse percurso nem publica suas entradas. Sua remoção total depende da
revisão do backend, não de apagar arquivos isoladamente.

O bloco e os recibos continuam com suas datas atuais. O contrato histórico
interpreta a cobertura hipotética e continua responsável por autorização,
garantia e pagamento. A implantação pública dessa fábrica está pendente;
esta revisão não modifica contratos implantados nem comprova pagamento na Sepolia.

Na interface atual, o modo historico ainda precisa ser selecionado explicitamente.
A revisao da interface/backend deve avaliar a retirada desse caminho convencional;
o servico historico ignora apolices convencionais e bloqueia entradas de sensores.
