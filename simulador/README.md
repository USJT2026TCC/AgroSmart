# Preparacao historica do INMET

O fluxo principal usa **Sao Simao/SP, estacao A770, de 2020 a 30/09/2026**.
O talhao e ficticio e considerado coincidente com a estacao por hipotese.
As precipitacoes e datas sao as publicadas pelo INMET; nao ha medicao ao vivo.

A serie preparada ja acompanha o repositorio em `backend/recursos/inmet/A770`.
Para executar a aplicacao, use `npm start` com Docker Desktop aberto: a API faz
a carga inicial automaticamente. Os passos abaixo sao apenas para reconstruir
o pacote a partir da fonte; nao sao exigidos em outra instalacao.

## Reconstruir o pacote (opcional)

Na raiz do projeto, com Python 3.10+ instalado:

```powershell
python -m venv simulador/.venv
.\simulador\.venv\Scripts\python.exe -m pip install -e "./simulador[dev]"
npm run dados:preparar
```

O comando baixa os ZIPs anuais oficiais necessarios (arquivos nacionais, tamanho
variavel), extrai somente A770, confere valores e duplicatas, agrega chuva diaria
e registra qualidade e procedencia. Nao requer chave de estacao nem envia transacao.
O mesmo comando atualiza o pacote publico apos conferir seus hashes. Na proxima
inicializacao da API (`npm start`), os anos sao importados no
banco persistente. Anos com os mesmos hashes nao sao importados novamente.
Nao execute `dados:preparar` a cada abertura do sistema.

Os arquivos ficam em `dados/`, fora do Git:

| Arquivo | Conteudo |
|---|---|
| `AAAA.zip` | Arquivo anual original, reutilizado como cache |
| `preparado/A770/AAAA-original.csv` | CSV da estacao, nos bytes originais |
| `preparado/A770/AAAA-diario.csv` | Datas originais, chuva e contagens de horas |
| `preparado/A770/manifesto.json` | URL, arquivo selecionado, SHA-256, intervalo e qualidade |

Se o ZIP contiver snapshots sobrepostos da mesma estacao, seleciona-se a maior
data final declarada no nome; snapshots nao sao somados. Ambiguidade permanece erro.
Falhas de download sao registradas e o comando termina com erro, permitindo retomar.
Hash local permite detectar alteracao posterior; nao e assinatura digital do INMET.

## Regra e lacunas

Dia utilizavel: pelo menos 20 horas de chuva validas. Dia seco: soma inferior a 1 mm.
Horas vazias, sentinelas, valores nao finitos, negativos ou acima de 500 mm/h nao
viram zero. Duplicatas iguais nao sao somadas; conflitantes invalidam a hora.
Dia ausente/incompleto interrompe a sequencia. Esta tolerancia nao equivale a
24 horas completas nem garante que nao choveu nas horas ausentes.

A consulta pode mostrar lacunas; a proposta historica exige que todos os dias da
cobertura atendam ao criterio. Contagem comeca em zero no inicio da cobertura, com
datas inclusivas e dias em UTC. Gatilho entre 1 e 366 dias, experimental e fixado
na proposta. Ao primeiro acionamento, paga-se integralmente uma unica vez.

## Arquivos do modulo

A pasta conserva o nome `simulador` para manter os caminhos de instalacao,
mas agora contem somente o ETL. Nao envia dados como se fossem sensores.

| Arquivo | Responsabilidade |
|---|---|
| `inmet.py` | Download oficial, leitura do CSV e metadados da estacao |
| `preparacao.py` | Validacao, duplicatas, consolidacao diaria, cache e manifesto |
| `cli.py` | Unico comando: `preparar` |
| `__main__.py`, `__init__.py` | Entrada e identificacao do pacote Python |
| `pyproject.toml`, `requirements.txt` | Instalacao e dependencias |

Sem MQTT, chaves de estacao, envio assinado, cenarios de sensores ou deslocamento
de datas. A carga fica em `backend/src/banco/importarInmet.js`, para nao duplicar
a logica de banco em Python. O oraculo consulta `inmet_dias` pela API autenticada
`/oraculo/serie-historica`; nao recebe credenciais diretas do PostgreSQL.

Docker executa o PostgreSQL; o volume e local a cada instalacao. Os usuarios
reproduzem a mesma base porque o pacote publico acompanha o Git e e importado
no primeiro inicio. API, interface e oraculo sao iniciados por `npm start` no host.

## Verificar

Na raiz: `npm test`. Todos os testes e configuracoes ficam em `testes/`.
Para executar so o simulador, a partir desta pasta:

```powershell
.\.venv\Scripts\python.exe -m pytest ../testes/simulador -c ../testes/configuracao/pytest.ini --basetemp ../testes/gerados/simulador/temporarios -q
```

Fonte: [INMET — dados historicos](https://portal.inmet.gov.br/dadoshistoricos).
