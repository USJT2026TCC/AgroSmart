# Blockchain

Contratos em Solidity, publicados na Sepolia, e o script que os publica.

## Contratos

| Arquivo | Função |
|---|---|
| `contracts/ApoliceHistorica.sol` | Uma apólice: guarda os termos e a garantia, recebe a contagem do oráculo e paga o produtor se o gatilho for atingido. Também permite cancelar antes da primeira publicação e resgatar a garantia no fim da cobertura |
| `contracts/ApoliceFactory.sol` | Cria as apólices; só a seguradora pode emitir |
| `contracts/OracleRegistry.sol` | Lista de oráculos autorizados a publicar; a seguradora autoriza e revoga |

Regras gravadas nos contratos: pagamento integral e único, gatilho de 1 a 366 dias,
cobertura dentro de 2020 a setembro de 2026, produtor diferente da seguradora e
publicações só de oráculo autorizado, em ordem de data.

## Implantação em uso

`implantacoes/sepolia.json` guarda os endereços que API, oráculo e interface usam:

| Contrato | Endereço |
|---|---|
| Fábrica de apólices | `0xE9CE1a3AC2685ec7Eb54205E6E72eeE4bfaFB386` |
| Registro de oráculos | `0xb9821B9aA456Ce8Ccc2B489c1C7381Ffff1f5Aa3` |
| Seguradora | `0x95eA48b7BF91446CF12C156aC2FDeA75Af03fD70` |
| Oráculo autorizado | `0xeFCf4d0c3f22ac012896c2D9c6bA35e9fd7D691D` |

Publicados em 28/10/2026 e verificados no Etherscan (Solidity 0.8.24, otimizador com
200 execuções). As fontes verificadas são as da tag `sepolia-2026-10-28`.
Para reproduzir o bytecode verificado, use essa tag: os comentários revisados na
branch principal também entram nos metadados da compilação.

## Publicar contratos próprios

Com `RPC_SEPOLIA`, `CHAVE_PRIVADA_SEGURADORA` e `CHAVE_PRIVADA_ORACULO` em `blockchain/.env`:

```powershell
$env:NOVA_IMPLANTACAO=1; npm run implantar:sepolia --workspace blockchain
```

`scripts/implantar.js` publica o registro, autoriza o oráculo, publica a fábrica e
reescreve `implantacoes/sepolia.json`. Usa ETH de teste da conta da seguradora.
Apólices da implantação anterior continuam na rede, mas a aplicação deixa de acompanhá-las.

Para verificar o código no Etherscan, com `ETHERSCAN_API_KEY` preenchida:

```powershell
cd blockchain
npx hardhat verify --network sepolia <registro> <seguradora>
npx hardhat verify --network sepolia <fabrica> <registro> <seguradora>
```

## Integração e limites

A API prepara os termos e confere a apólice emitida pelo evento `ApoliceEmitida`.
O oráculo consulta `verTermos()` e publica com `publicarIndices()`. O indexador
registra garantia, publicação, pagamento, cancelamento e resgate a partir dos eventos.
A autorização ou revogação de oráculos pertence ao administrador do registro.

O contrato valida autorização, datas, ordem das publicações e pagamento único.
Ele não consulta o INMET nem recalcula a chuva; essa conferência pertence ao oráculo.
O resgate sem indenização depende da publicação do último dia da cobertura.
O beneficiário precisa aceitar ETH: se o recebimento for recusado, a publicação
inteira reverte e a garantia pode permanecer retida. Não há saque alternativo.
