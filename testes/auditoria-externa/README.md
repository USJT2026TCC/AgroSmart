# Auditoria externa das apólices A e B

Verificações feitas de fora do sistema, sem usar a API nem o código do oráculo. Elas
sustentam o Quadro 5 (procedimento de auditoria) e a explicação do custo do
cancelamento C1 na seção 4.3 do artigo.

Estes arquivos **não fazem parte de `npm test`**: a contagem da suíte automatizada
(353 testes) continua a mesma.

## 1. Auditoria da decisão (`auditar_apolice.py`)

Usa apenas o pacote INMET em `api/recursos/inmet/A770` e os registros JSON-RPC da
Sepolia em `testes/evidencias/validacao-2026-11-03`.

| Passo | O que faz |
| --- | --- |
| 1 | Confere o SHA-256 dos arquivos do pacote contra o manifesto e recompõe o resumo da série |
| 2 | Recalcula a sequência de dias secos S(d) pela Equação 1 e o dia a publicar |
| 3 | Recalcula o Keccak-256 do texto dos termos (requer o texto exibido pela interface) |
| 4 | Compara o resultado com os eventos `IndicesPublicados` e `CondicaoAvaliada` |

Requisito: Python 3.10 ou superior e `pycryptodome` (`pip install pycryptodome`).
Execute na raiz do repositório:

```bash
python3 testes/auditoria-externa/auditar_apolice.py . testes/evidencias/validacao-2026-11-03/cenario-a-sepolia.json
python3 testes/auditoria-externa/auditar_apolice.py . testes/evidencias/validacao-2026-11-03/cenario-b-sepolia.json
```

Resultado registrado:

| Apólice | Passo 1 | Passo 2 | Passo 4 |
| --- | --- | --- | --- |
| A | Pacote íntegro | 10/06/2024, índice 10, gatilho atingido | Período, índice e condição coincidem |
| B | Pacote íntegro | 21/02/2024, índice 0, gatilho não atingido | Período, índice e condição coincidem |

O passo 3 não é executado só com os registros públicos: o texto dos termos inclui o
identificador da proposta (UUID), que fica no banco e não é gravado na cadeia. Para
executá-lo, salve o texto exibido na página da apólice num arquivo e passe-o como
terceiro argumento.

## 2. Gravações de armazenamento no cancelamento (`trace_cancelamento.test.cjs`)

Emite duas apólices numa rede local e compara as gravações de armazenamento do
cancelamento sem garantia (C1) e com garantia (C2). Execute a partir de `blockchain/`:

```bash
npx hardhat --config ../testes/blockchain/hardhat.config.cjs test ../testes/auditoria-externa/trace_cancelamento.test.cjs
```

Resultado esperado: no C1, a posição da situação da apólice passa de 0 para 4 (primeira
gravação não nula); no C2, passa de 1 para 4, porque o depósito já a havia preenchido.
É a única gravação que difere entre os dois cancelamentos, o que explica a diferença
de *gas* observada na Sepolia (133.798 no C1 e 45.250 no C2).
