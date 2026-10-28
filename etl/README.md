# ETL do INMET

Ferramenta Python que baixa os arquivos históricos do INMET, separa a estação A770
(São Simão/SP), valida as medições e monta a chuva diária de 01/01/2020 a 30/09/2026.

**Não é preciso rodar para usar o sistema.** O resultado já está no repositório, em
`api/recursos/inmet/A770/`, e a API importa esses arquivos no banco ao iniciar.

## O que fica em `api/recursos/inmet/A770/`

| Arquivo | Conteúdo |
|---|---|
| `AAAA-original.csv` | Registros da estação A770, copiados byte a byte do arquivo do INMET |
| `AAAA-diario.csv` | Chuva de cada dia e quantas horas foram válidas, inválidas ou ausentes |
| `manifesto.json` | Origem dos arquivos, período e hash SHA-256 de cada um |

São 2.465 dias. Fonte: portal de dados históricos do INMET, arquivos obtidos em 19 e
20/10/2026. O hash permite conferir que os arquivos não mudaram; não é uma assinatura
do INMET.

## Regras de limpeza

- Valores ausentes, códigos de "sem medição" e chuva fora de 0 a 500 mm/h não viram zero:
  a hora fica marcada como ausente ou inválida.
- Horas repetidas com o mesmo valor contam uma vez; valores conflitantes invalidam a hora.
- Um dia é utilizável com pelo menos 20 horas válidas.
- O ETL não decide estiagem: isso é feito pela API e pelo oráculo.

## Reconstruir os dados (opcional)

Na raiz do projeto, com Python 3.10 ou mais recente:

```powershell
python -m venv etl/.venv
.\etl\.venv\Scripts\python.exe -m pip install -e ./etl
npm run dados:preparar
npm run dados:empacotar
```

Os arquivos anuais do INMET são grandes; ficam em cache em `etl/dados/`. Na próxima
inicialização, a API reimporta apenas os anos que mudaram.

| Arquivo em `src/etl/` | Função |
|---|---|
| `inmet.py` | Baixa o arquivo anual e lê as medições |
| `preparacao.py` | Limpa, monta o diário e grava o manifesto |
| `limites.py` | Lê o período e a estação de `configuracao/historico.json` |
| `cli.py`, `__main__.py` | Comando `preparar` |
