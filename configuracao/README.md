# Configuração compartilhada

| Arquivo | Função |
|---|---|
| `escopo.js` | Define os dois acessos fixos, soja e São Simão/SP; usado pela API e pela interface |
| `historico.json` | Define estação, datas, chuva do dia seco, horas mínimas e limites do gatilho; usado por ETL, API, oráculo, interface e scripts |

O recorte atual é A770, de 01/01/2020 a 30/09/2026, em UTC. Dia seco tem menos
de 1 mm; dia utilizável exige 20 horas válidas. O gatilho experimental vai de 1 a 366 dias.

Alterar esses arquivos não modifica contratos já publicados. Os valores precisam
permanecer compatíveis com o pacote INMET e as regras dos contratos na Sepolia.
