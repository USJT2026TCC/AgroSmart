# Dados do INMET

Fonte: [INMET — dados históricos](https://portal.inmet.gov.br/dadoshistoricos).
Recorte: estação automática A770, São Simão/SP, de 01/01/2020 a 30/09/2026.
Os registros mantêm suas datas originais em UTC.

## Preparação

O ETL baixa os ZIPs anuais, seleciona A770, valida as medições e consolida a
precipitação diária. O pacote em `api/recursos/inmet/A770/` contém:

| Arquivo | Conteúdo |
|---|---|
| `AAAA-original.csv` | Registros selecionados da estação |
| `AAAA-diario.csv` | Total diário e contagem de horas válidas, inválidas e ausentes |
| `manifesto.json` | Origem, período e hashes SHA-256 dos arquivos |

O preparo rejeita valores não finitos, negativos ou superiores a 500 mm/h.
Ausentes e sentinelas permanecem identificados como ausência. Duplicatas idênticas
contam uma vez; medições conflitantes invalidam a hora.

Um dia utilizável pode conter horas ausentes: o critério mínimo é de 20 horas
válidas. A soma representa as horas disponíveis, com essa limitação registrada.
As regras de avaliação estão em [regras do seguro](REGRAS.md).

## Armazenamento e integridade

A API verifica os hashes ao importar anos novos ou alterados, em transações.
`inmet_arquivos` registra a procedência; `inmet_dias` armazena os dados diários.
Anos com os mesmos hashes são reutilizados.

Os termos da proposta incluem o hash da série contratada. O oráculo confere os
termos em cadeia e compara os dados recebidos da API ao pacote público. Os hashes
permitem detectar alterações; a origem declarada continua sendo o INMET.

Cada instalação importa o pacote no seu próprio volume Docker. Para reconstruí-lo,
consulte o [ETL](../etl/README.md).
