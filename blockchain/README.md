# Blockchain

Esta pasta contém os contratos Solidity e as ferramentas para publicá-los na
Sepolia. As regras do seguro estão em [REGRAS.md](../docs/REGRAS.md).

## Contratos

| Arquivo em `contracts/` | Responsabilidade |
|---|---|
| `OracleRegistry.sol` | Lista os oráculos autorizados. A seguradora pode autorizar, revogar e transferir a administração do registro. |
| `ApoliceFactory.sol` | Cria contratos de apólice e organiza seus endereços por produtor e talhão. A aplicação chama `emitirApoliceHistorica`. |
| `ApoliceHistorica.sol` | Guarda os termos, valida datas históricas e implementa garantia, publicação, pagamento, cancelamento e resgate. |

A fábrica cria uma apólice histórica para cada emissão. O dinheiro fica na apólice,
que transfere ao produtor quando a condição é atendida.

## `implantacoes/`

`sepolia.json` registra a rede, os endereços do registro e da fábrica, as contas
públicas da seguradora e do oráculo e o bloco inicial de consulta. Também contém
o identificador da transação e o gas da publicação da fábrica.

API, oráculo e interface usam esse manifesto para localizar os mesmos contratos.
O arquivo contém informações públicas e deve acompanhar o projeto. As chaves
privadas são configuradas em `.env`, que fica fora do Git.

## `scripts/`

`implantar.js` publica a fábrica e grava o manifesto. Usa o registro da seguradora
quando ele já está configurado; em uma instalação independente, também cria o
registro e autoriza o oráculo. A troca de fábrica exige que a atual esteja sem apólices.
Essa operação usa a conta da seguradora e consome ETH de teste. Com um manifesto
existente, o script bloqueia a publicação; substituí-lo exige definir explicitamente
`NOVA_IMPLANTACAO=1`.

Publicar infraestrutura é diferente de emitir uma apólice. A emissão e o depósito
da garantia são operações da seguradora na aplicação, assinadas pela MetaMask.
O início normal do sistema usa a implantação configurada.

## Configuração

| Arquivo | Função |
|---|---|
| `hardhat.config.js` | Compilador Solidity 0.8.24, otimizador, RPC Sepolia e verificação no Etherscan |
| `.env.example` | Modelo das variáveis de configuração |
| `package.json` | Dependências e comandos do módulo |
| `.prettierrc.json` | Formatação do código |

`artifacts/`, `cache/` e `node_modules/` são gerados localmente e ficam fora do Git.

## Termos

A aplicação e os serviços usam o mesmo formato de termos. `modoPagamento` e
`limiarClimaticoIntegral` são obrigatoriamente zero; o pagamento é integral.
O único caminho de emissão da fábrica é `emitirApoliceHistorica`.
