# Blockchain

Contratos em Solidity, publicados na Sepolia, e o script que os publica.

## Contratos

| Arquivo | Função |
|---|---|
| `contracts/ApoliceHistorica.sol` | Uma apólice: guarda os termos e a garantia, recebe a contagem do oráculo e libera a indenização se o gatilho for atingido; o produtor a saca com `sacarIndenizacao()`. Também permite cancelar antes da primeira publicação e resgatar a garantia no fim da cobertura |
| `contracts/ApoliceFactory.sol` | Cria as apólices; só a seguradora pode emitir |
| `contracts/OracleRegistry.sol` | Lista de oráculos autorizados a publicar; a seguradora autoriza e revoga |

Regras gravadas nos contratos: pagamento integral e único, gatilho de 1 a 366 dias,
cobertura dentro de 01/01/2020 a 31/12/2024, produtor diferente da seguradora e
publicações só de oráculo autorizado, em ordem de data.

## Implantação em uso

`implantacoes/sepolia.json` guarda os endereços que API, oráculo e interface usam:

| Contrato | Endereço |
|---|---|
| Fábrica de apólices | `0x88c6D10589b66A597a3958Cc3Bc98585d86a97c6` |
| Registro de oráculos | `0xb9821B9aA456Ce8Ccc2B489c1C7381Ffff1f5Aa3` |
| Seguradora | `0x95eA48b7BF91446CF12C156aC2FDeA75Af03fD70` |
| Oráculo autorizado | `0xeFCf4d0c3f22ac012896c2D9c6bA35e9fd7D691D` |

A fábrica foi publicada e verificada em 05/11/2026; as fontes correspondem à tag
`sepolia-2026-11-05`. O registro foi mantido e suas fontes verificadas estão na tag
`sepolia-2026-10-28`. Compilação: Solidity 0.8.24, otimizador com 200 execuções.

O manifesto também lista as fábricas anteriores. O indexador acompanha seus eventos
e as apólices existentes; novas emissões usam a fábrica atual.

## Publicar contratos próprios

Com `RPC_SEPOLIA`, `CHAVE_PRIVADA_SEGURADORA` e `CHAVE_PRIVADA_ORACULO` em `blockchain/.env`:

```powershell
$env:NOVA_IMPLANTACAO=1; npm run implantar:sepolia --workspace blockchain
```

`scripts/implantar.js` publica o registro, autoriza o oráculo, publica a fábrica e
reescreve `implantacoes/sepolia.json`. Usa ETH de teste da conta da seguradora.
Para atualizar somente a fábrica, quando muda o recorte dos dados ou o contrato da
apólice, mantendo o registro e o acompanhamento das apólices existentes:

```powershell
$env:ATUALIZAR_FABRICA=1
npm run implantar:sepolia --workspace blockchain
Remove-Item Env:ATUALIZAR_FABRICA
```

O endereço anterior entra em `fabricasAnteriores` no manifesto. Depois da publicação,
execute `npm start` na raiz para atualizar os serviços. Se a conexão cair durante
a publicação, confira a transação impressa antes de repetir o comando.

Para verificar o código no Etherscan, com `ETHERSCAN_API_KEY` preenchida:

```powershell
cd blockchain
npx hardhat verify --network sepolia <registro> <seguradora>
npx hardhat verify --network sepolia <fabrica> <registro> <seguradora>
```

## Integração e limites

A API prepara os termos e confere a apólice emitida pelo evento `ApoliceEmitida`.
O oráculo consulta `verTermos()` e publica com `publicarIndices()`. O indexador
registra garantia, publicação, liberação e saque da indenização, cancelamento e resgate a partir dos eventos.
A autorização ou revogação de oráculos pertence ao administrador do registro.

O contrato valida autorização, datas, ordem das publicações e pagamento único.
Ele não consulta o INMET nem recalcula a chuva; essa conferência pertence ao oráculo.
O resgate sem indenização depende da publicação do último dia da cobertura.
A publicação só reserva a indenização; o valor sai do contrato quando o produtor titular
chama `sacarIndenizacao()`. Se a carteira recusar ETH, só o saque reverte: a decisão, o
relógio da cobertura e a reserva permanecem, e o produtor pode tentar de novo. A
seguradora não resgata a indenização reservada.

## Numeração dos requisitos nos comentários

Os comentários dos contratos usam uma numeração de requisitos anterior à documentação
de software final, e os mesmos números hoje têm outro significado. O código não é
editado porque precisa continuar igual ao verificado no Etherscan.

| Citado no código | Onde | Na documentação final |
|---|---|---|
| RF07 | `ApoliceFactory`: emissão da apólice | RF09 |
| RF08 | `ApoliceHistorica`: `hashTermos` e `verTermos()` | RF09 (resumo dos termos) e RF16 (consulta) |
| RF10 | `ApoliceHistorica`: cancelamento | RF14 |
| RF18 | `OracleRegistry` e `ApoliceHistorica`: lista de oráculos e recusa de outros endereços | RF11 |
| RF20 | `ApoliceHistorica`: período já publicado | RF12 |
| RNF09 | `ApoliceHistorica`: proteção contra reentrância | RNF04 |
| RNF10 | `OracleRegistry`: controle de acesso | RNF02 |
| RNF18 | `ApoliceHistorica`: `publicacao()` | RF16 |
| HU02, critério 3 | `OracleRegistry`: autorizar e revogar | HU11 |
