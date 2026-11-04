# Formato dos termos e do vínculo de carteira

Dois formatos que qualquer pessoa precisa conhecer para reproduzir as conferências do
AgroSmart: o texto dos termos, cujo resumo fica gravado em cada apólice, e a mensagem
assinada no vínculo da carteira. As siglas RN e RNF são as da documentação de software.

## Texto dos termos da apólice

A API descreve os termos de cada apólice em um texto com 18 campos, em ordem fixa e
separados pelo caractere `|`, sem espaços entre eles. O resumo `hashTermos`, gravado no
contrato na emissão, é o Keccak-256 desse texto codificado em UTF-8.

| Nº | Campo | Conteúdo |
|---|---|---|
| 1 | `AgroSmart:historico:v3` | Versão do formato, fixa |
| 2 | `estacao:‹código›` | Estação da série, A770 |
| 3 | `sha256-serie:‹resumo›` | Resumo SHA-256 da série tratada, registrado no manifesto |
| 4 | `parametro:experimental` | Fixo |
| 5 | `contagem:inicio-da-cobertura` | Fixo; a sequência começa no início da cobertura (RN05) |
| 6 | `dia-seco:chuva-inferior-a-1-mm` | Fixo (RN05) |
| 7 | `dia-utilizavel:minimo-20-horas-validas` | Fixo (RN04) |
| 8 | `datas:utc-inclusivas` | Fixo (RNF06) |
| 9 | `talhao:coincidente-com-estacao-por-hipotese` | Fixo |
| 10 | `pagamento:integral` | Fixo (RN07) |
| 11 | `apolice-de-proposta:‹identificador›` | Identificador da proposta |
| 12 | `produtor:‹endereço›` | Carteira beneficiária, em letras minúsculas |
| 13 | `talhao:‹identificador›` | Identificador do talhão |
| 14 | `cultura:‹cultura›` | Cultura segurada, soja |
| 15 | `limiar-climatico:‹dias›` | Gatilho, em dias secos consecutivos |
| 16 | `limite-wei:‹valor›` | Indenização, em wei |
| 17 | `vigencia-inicio:‹instante›` | Início da cobertura, às 00:00:00 UTC, em segundos desde 01/01/1970 |
| 18 | `vigencia-fim:‹instante›` | Fim da cobertura, às 23:59:59 UTC, em segundos desde 01/01/1970 |

### Exemplo

Proposta ilustrativa com identificador 1, talhão `talhao-01`, gatilho de 30 dias,
indenização de 0,006 ETH e cobertura de 01/05/2024 a 30/06/2024, com o resumo da série
usado na validação. O texto é uma única linha:

```text
AgroSmart:historico:v3|estacao:A770|sha256-serie:63e43cb2a0834fe508619012a04cdf88dd586a44c12ca142292eb6d342c9d663|parametro:experimental|contagem:inicio-da-cobertura|dia-seco:chuva-inferior-a-1-mm|dia-utilizavel:minimo-20-horas-validas|datas:utc-inclusivas|talhao:coincidente-com-estacao-por-hipotese|pagamento:integral|apolice-de-proposta:1|produtor:0xc8fdfca3cfec202d8babf4e89becab5e57773071|talhao:talhao-01|cultura:soja|limiar-climatico:30|limite-wei:6000000000000000|vigencia-inicio:1714521600|vigencia-fim:1719791999
```

O resumo desse texto é:

```text
0x1f19cf63cc2e2307466a20d4a0cf6a5c481b0b3d8592249fa7ac5b307f72ac08
```

## Mensagem de vínculo da carteira

Para vincular a carteira, a interface pede um desafio à API, na rota
`POST /api/carteira/desafio`. A API gera uma mensagem com o identificador do usuário, o
instante de emissão e um número único, válida por cinco minutos, e a guarda no banco.
Exemplo, com instante e número único ilustrativos:

```text
AgroSmart — vinculo de carteira
usuario: produtor
emitido em: 2026-11-03T14:00:00.000Z
numero unico: 0x9f2c41d07a6be3184c5d2e90f1a7b3c6

Assinar esta mensagem nao movimenta valor e nao autoriza nenhuma transacao.
```

A MetaMask assina a mensagem no padrão ERC-191, também chamado EIP-191, pela função
`signMessage` da biblioteca ethers.js. A API consome o desafio antes de qualquer outra
verificação, recupera o endereço que assinou com a função `verifyMessage` e só vincula a
carteira se esse endereço for o informado pelo produtor. A assinatura não movimenta valor
nem autoriza transação.
