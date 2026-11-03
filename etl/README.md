# ETL do INMET

Prepara a estação A770 (São Simão/SP), de 01/01/2020 a 31/12/2024, para a demonstração.
O pacote está em `api/recursos/inmet/A770/`; a API o importa no PostgreSQL ao iniciar.

## Tratamento

1. Ler os arquivos anuais e validar estação, datas, horários e precipitação.
2. Consolidar horas duplicadas, rejeitando valores conflitantes e precipitação fora de 0–500 mm/h.
3. Considerar observado válido o dia com pelo menos 20 horas válidas.
4. Em dia incompleto, copiar a precipitação de cada horário do último dia observado válido.
   Em uma sequência incompleta, manter a mesma origem observada, inclusive entre anos.
   Sem dia válido anterior, interromper o preparo; não usar dados futuros.
5. Recalcular os totais diários e registrar todas as substituições no manifesto.

O preenchimento é experimental e pode alterar a sequência seca e o acionamento.
São estimativas, não novas medições do INMET. Temperatura e outras variáveis do
dia de destino não são substituídas: apenas a precipitação interessa ao índice.

| Arquivo | Conteúdo |
|---|---|
| `AAAA-fonte.csv` | Arquivo oficial intacto extraído do ZIP do INMET |
| `AAAA-original.csv` | Série horária tratada; nome mantido para compatibilidade com a importação |
| `AAAA-diario.csv` | Totais e contagens de horas recalculados da série tratada |
| `manifesto.json` | Origem, hashes e cada dia preenchido, data de origem, chuva copiada e registro anterior |

O recorte tem 1.827 dias: 1.821 originalmente utilizáveis e seis preenchidos.
Os originais oficiais permanecem disponíveis nos arquivos `fonte`.
SHA-256 comprova integridade do arquivo; não é uma assinatura do INMET.

## Reconstruir o pacote

Com Python 3.10 ou superior, na raiz:

```powershell
python -m venv etl/.venv
.\etl\.venv\Scripts\python.exe -m pip install -e ./etl
npm run dados:preparar
```

Fontes locais de hash conferido e ZIPs válidos são reutilizados. Downloads só
ocorrem quando a fonte local não está disponível. O empacotador confere os hashes
antes de publicar os CSVs. A próxima inicialização da API reimporta anos alterados.

| Arquivo em `src/etl/` | Responsabilidade |
|---|---|
| `inmet.py` | Download e leitura da fonte meteorológica |
| `preparacao.py` | Validação, preenchimento horário, consolidação e auditoria |
| `limites.py` | Estação, período e parâmetros compartilhados |
| `cli.py`, `__main__.py` | Comando de preparo |

Fluxo: INMET → ETL → arquivos tratados e fonte preservada → importação pela API → PostgreSQL.
O ETL não publica índices nem movimenta valores na blockchain.
