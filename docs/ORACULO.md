# Oráculo

Fluxo: PostgreSQL → API autenticada → conferência dos termos e do pacote INMET →
cálculo da estiagem → fila persistente → contrato → confirmação e relato para API.
O oráculo usa A770, começa a contagem no início da cobertura e preserva o primeiro
acionamento. Sem acionamento, publica o último dia. Recusa cobertura incompleta.

Os hashes vinculam os termos e os CSVs públicos contratados. Permitem detectar
divergências entre banco, pacote e apólice; não provam a verdade meteorológica.
O serviço tem um operador e uma fonte de dados, sem alegação de descentralização.

A fila salva o hash transmitido para recuperar o recibo sem reenviar. Falhas de
auditoria ou relato não geram outra transferência. Se o RPC falhar antes de devolver
o hash, é necessário conferir a cadeia antes de reabrir uma tentativa esgotada.

O contrato é responsável pela autorização, garantia e pagamento único. A fábrica
histórica está implantada e verificada na Sepolia. As datas climáticas são passadas;
as datas dos blocos e transferências são atuais. O serviço executa no Docker.

Arquivos e comandos: [oráculo](../oraculo/README.md).
Testes e limites da verificação: [evidências](../testes/evidencias/verificacao-atual.md).
