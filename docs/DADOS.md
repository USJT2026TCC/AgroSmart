# Fontes de dados

**Recorte operacional atual:** somente Sao Simao/SP (A770), de 2020 a 30/09/2026.
Preparacao unica descrita em [simulador/README.md](../simulador/README.md).
Os trechos abaixo sobre outras estacoes e periodos registram estudos anteriores;
nao definem as fontes da demonstracao historica atual.


Todo número que aparece na demonstração vem de algum lugar. Este documento diz de onde, sob que
licença, e o que foi feito com ele. Nenhum dado usado no projeto é inventado sem que a própria
tela diga que é simulado.

---

## 1. Dados meteorológicos — INMET

**Fonte:** Instituto Nacional de Meteorologia (INMET), Ministério da Agricultura e Pecuária.
Dados Históricos das estações automáticas — <https://portal.inmet.gov.br/dadoshistoricos>

**O que é:** um arquivo ZIP por ano, de 2000 a 2026, com um CSV por estação automática. Cada
CSV tem uma linha por hora, com chuva, temperatura, umidade, pressão, radiação e vento. São
dados públicos, distribuídos gratuitamente pelo instituto.

**Como citar no TCC:**

> INSTITUTO NACIONAL DE METEOROLOGIA (INMET). *Dados históricos — estações automáticas*.
> Brasília: INMET. Disponível em: https://portal.inmet.gov.br/dadoshistoricos. Acesso em:
> 22 set. 2026.

**Como baixar:**

```bash
cd simulador && python -m simulador baixar --ano 2024
```

O arquivo fica em `simulador/dados/`, que está no `.gitignore` — são ~100 MB por ano, e dado
público de terceiro não entra no repositório do trabalho.

> O portal fecha a conexão quando o cabeçalho de agente não parece o de um navegador. O
> simulador envia um cabeçalho de navegador por isso, e apenas por isso: o arquivo é público e é
> o mesmo que o navegador baixa.

### A estação escolhida, e por quê

| Estação | Local | Distância do talhão | Por que |
|---|---|---:|---|
| **A770** | São Simão/SP | 0,1 km | Fonte principal. Série de 2024 completa: 366 dias com 20 h ou mais de medição |
| **A747** | Pradópolis/SP | 57 km | Segunda fonte. O consolidador exige no mínimo duas, e uma estação sozinha não pode decidir um pagamento |
| A708 | Franca/SP | 79 km | **Descartada:** apenas 106 dias completos em 2024 |

O talhão da demonstração foi posicionado ao lado da A770 justamente por isso: seguro indexado
por estação distante mede outra lavoura que não a segurada.

### A estiagem real de 2024

Na janela de 25/06 a 09/08/2024, a A770 registra **39 dias consecutivos com menos de 1 mm de
chuva**, e a A747 registra a mesma estiagem. É a seca histórica do Sudeste em 2024, e ela cruza
o limiar de 30 dias do produto contratado — o pagamento da demonstração acontece por causa de um
evento climático que realmente ocorreu.

**Os dados de chuva são reais; o talhão é fictício, criado para a demonstração.** A janela de
junho a agosto cai no vazio sanitário da soja em São Paulo, quando a lei proíbe soja viva no campo
(para 2025/26, de 1º/06 a 31/08 na Região 1 e até 12 ou 15/09 nas Regiões 2 e 3). Nenhuma lavoura
de soja real estaria sujeita a essa seca. Ver DECISOES.md 1.23.

Conferido com:

```bash
python -m simulador analisar --estacao A770 --ano 2024
```

### O que foi feito com os dados

| Operação | Feita? | Observação |
|---|---|---|
| Valores medidos (chuva, temperatura, umidade) | **inalterados** | Vão para a cadeia como o INMET publicou |
| Recorte de janela de datas | sim | `--de` e `--ate` |
| Deslocamento das datas | sim, quando pedido | `--ate-hoje` move a série para terminar ontem, porque a apólice da demonstração tem vigência agora. O comando **avisa na tela** quantos dias deslocou |
| Preenchimento de horas sem medição | **não** | Hora sem medição continua sem medição. Presumir zero transformaria sensor quebrado em dia seco, e dia seco é o que aciona o pagamento |

### Qualidade do dado, tratada como parte do problema

O pluviômetro falha. Em 2025, a estação A747 tem medição de chuva em 3.406 das 8.760 horas do
ano. Isso não é defeito de importação: é o estado real da rede de estações, e o sistema precisa
se comportar bem diante dele.

Por isso a contagem de dias secos **para quando falta dado**, em vez de presumir que o dia foi
seco (ver [DECISOES.md](DECISOES.md), 1.8). E por isso a reputação da fonte cai quando ela envia
leitura implausível (RF13).

---

## 2. O que continua simulado, e está marcado como tal

| Peça | Situação |
|---|---|
| Sensor de solo do talhão | Sem equivalente real. Cadastrado como fonte, sem série, até existir o hardware |
| `oraculo/src/fonteSimulada.js` | Série sintética determinística, dos três cenários da HU04. Continua no projeto para os testes rodarem sem depender de arquivo externo |
| Carteira simulada do aplicativo | Ferramenta de desenvolvimento, com faixa de aviso permanente na tela. Não usar em apresentação |

---

## 3. Regras que valem para qualquer dado novo

1. **Citar a fonte** no documento e no código que a lê.
2. **Conferir a licença** antes de usar, e registrar aqui.
3. **Não versionar** o arquivo baixado: script de download, sim; dado de terceiro, não.
4. **Não preencher buraco** de série com valor inventado. Falta de dado é informação.
5. **Declarar toda transformação** — a que o simulador faz aparece na tela quando ele roda.
