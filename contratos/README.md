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

Na raiz, `npm test` executa cobertura, Slither e as demais suites. Dentro de contratos/,
`npm run testar` executa os testes com a configuracao centralizada em testes/.
Mocks e ferramentas de ensaio tambem ficam exclusivamente em testes/.

O uso e Sepolia. Rede local e reservada aos testes. A fabrica publica atual ainda
precisa ser atualizada e verificada para emitir a versao historica; os contratos
ja implantados nao sao alterados por editar o codigo. Segredos ficam no .env ignorado.

Referencia: docs/CONTRATOS.md. Enderecos atuais: implantacoes/sepolia.json.
