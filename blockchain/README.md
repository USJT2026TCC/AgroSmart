# Contratos

Solidity 0.8.24, com Hardhat. O fluxo atual usa cobertura historica INMET A770,
01/01/2020 a 30/09/2026, e pagamento integral uma unica vez.

| Arquivo em contracts/ | Funcao |
|---|---|
| OracleRegistry.sol | Autoriza enderecos de oraculos |
| ApolicePolicy.sol | Base de garantia, avaliacao, pagamento, cancelamento e eventos |
| ApoliceHistorica.sol | Aplica cobertura historica e impede datas fora da serie |
| ApoliceFactory.sol | Emite apolices; o aplicativo usa emitirApoliceHistorica |

Os limites Solidity correspondem a configuracao/historico.json e sao conferidos
pelos testes. O timestamp do bloco registra a transacao atual; nao e uma medicao
meteorologica. O contrato nao consulta INMET nem PostgreSQL diretamente.


O uso é Sepolia. Rede local é reservada aos testes. A fábrica histórica atual está
implantada e verificada; consulte o manifesto público. Contratos implantados
não são alterados ao editar o código. Segredos ficam no .env ignorado.

Referencia: ../docs/REGRAS.md. Enderecos atuais: implantacoes/sepolia.json.
