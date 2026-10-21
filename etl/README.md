# Dados históricos do INMET (ETL)

Esta pasta conserva o nome `etl`, mas contém somente a ferramenta de
extração, validação e consolidação dos dados. Não simula sensores ou pagamentos.

**Recorte:** São Simão/SP, estação A770, de 01/01/2020 a 30/09/2026.
Fonte: [INMET — dados históricos](https://portal.inmet.gov.br/dadoshistoricos).
Datas e medições são históricas; o talhão coincidente com a estação é fictício.

## Usar os dados existentes

O pacote público está em `api/recursos/inmet/A770`: CSVs originais, séries
diárias e manifesto com origem e SHA-256. `npm start`, na raiz, importa o pacote
no PostgreSQL automaticamente. Não é necessário executar Python ou baixar novamente.
O volume Docker guarda os dados localmente; o pacote no Git permite reproduzir
a carga em outros computadores. Credenciais e cadastros não fazem parte desse pacote.

## Reconstruir o pacote (opcional)

Na raiz, com Python 3.10+ instalado, no Windows:

```powershell
python -m venv etl/.venv
.\etl\.venv\Scripts\python.exe -m pip install -e ./etl
npm run dados:preparar
```

O comando baixa os ZIPs anuais oficiais necessários, extrai A770, valida e
consolida a chuva diária e atualiza o pacote público. O cache em `etl/dados/`
é reutilizado após conferir os hashes. Os ZIPs nacionais podem ser grandes.
Uma falha impede concluir o pacote; consulte o manifesto e execute novamente.
Na próxima inicialização da API, a importação atualiza os anos alterados.

## Limpeza e qualidade

- Ausentes, sentinelas, valores não finitos e chuva fora de 0–500 mm/h não viram zero.
- Horas duplicadas iguais não são somadas; conflitos invalidam a hora.
- O diário conserva chuva e contagens de horas válidas, inválidas e ausentes.
- Dia utilizável exige ao menos 20 horas válidas. Isso não garante 24 horas completas.
- Snapshots sobrepostos não são somados; usa-se o de maior data final, sem ambiguidade.

O ETL conserva lacunas. A regra de estiagem e a aceitação da cobertura ficam na
API/oráculo, descritas no [escopo](../docs/ESCOPO-ATUAL.md). Hash não é assinatura
digital do INMET. O módulo não exige carteira, MQTT ou chave de estação.

## Arquivos

| Arquivo em `src/etl/` | Responsabilidade |
|---|---|
| `inmet.py` | Download do ZIP e leitura da precipitação e metadados |
| `preparacao.py` | Limpeza, diário, cache e manifesto |
| `cli.py` | Comando único `preparar` |
| `__main__.py`, `__init__.py` | Entrada e identificação do pacote |

A carga no banco é feita por `api/src/banco/importarInmet.js`. O oráculo
consulta a série por API; não usa credenciais diretas do PostgreSQL.

![Fluxo de dados e avaliação](../docs/imagens/fluxo-dados.svg)

O ETL lê os limites de `configuracao/historico.json` e recusa outra estação
ou intervalos fora do recorte antes de iniciar downloads.
