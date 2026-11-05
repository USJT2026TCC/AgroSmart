# Conferência complementar das apólices

Estas ferramentas são executadas separadamente de `npm test`. São verificações
da equipe fora do fluxo da aplicação, não uma auditoria independente de terceiros.

## Recalcular a decisão

`auditar_apolice.py` lê o pacote A770 e os registros salvos da Sepolia, sem consultar
a API e sem importar o oráculo. Confere SHA-256, recalcula a sequência seca e compara
período, índice e condição com os eventos registrados. Não consulta a rede ao vivo.

Na raiz, com Python 3.10 ou superior:

```bash
python testes/auditoria-externa/auditar_apolice.py . testes/evidencias/validacao-2026-11-03/registros/cenario-a-sepolia.json
python testes/auditoria-externa/auditar_apolice.py . testes/evidencias/validacao-2026-11-03/registros/cenario-b-sepolia.json
```

O resultado registrado é 10/06/2024, índice 10 para A, e 21/02/2024, índice 0 para B.
Para conferir também Keccak-256, instale `pycryptodome` e acrescente um arquivo
com o texto exato dos termos
exibidos na apólice. O UUID da proposta não está nos registros públicos. O script
mostra as comparações; confira os campos `coincide` na saída.

## Inspecionar o cancelamento local

`trace_cancelamento.test.cjs` compara armazenamento e gas dos cancelamentos sem e
com garantia em EVM local. É um diagnóstico: imprime as gravações e não contém
asserções de aprovação. Execute em `blockchain/`:

```bash
npx hardhat --config ../testes/blockchain/hardhat.config.cjs test ../testes/auditoria-externa/trace_cancelamento.test.cjs
```

O resultado registrado compara situação 0 → 4 e 1 → 4. A diferença de 10.028 gas
observada localmente não explica integralmente os 88.548 gas de diferença entre
as transações da Sepolia; isso exigiria rastrear as próprias transações públicas.
