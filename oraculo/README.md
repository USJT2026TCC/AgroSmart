# OrÃ¡culo histÃ³rico

Consulta a sÃ©rie de SÃ£o SimÃ£o/SP (A770) pela API do backend, calcula os dias secos
**desde o inÃ­cio da cobertura** e publica o resultado no contrato histÃ³rico.
NÃ£o simula sensores, nÃ£o desloca datas e nÃ£o acessa o PostgreSQL diretamente.
A interface utiliza o modo histÃ³rico. Novas propostas convencionais sÃ£o recusadas
pelo backend; apÃ³lices convencionais antigas sÃ£o ignoradas pelo serviÃ§o.

## Funcionamento

1. Consulta apÃ³lices histÃ³ricas ativas, apÃ³s o depÃ³sito da garantia.
2. Busca os dias e os termos na API autenticada.
3. Confere o texto e o hash dos termos com a apÃ³lice; confronta os dias recebidos
   com os CSVs e hashes do pacote pÃºblico `api/recursos/inmet/A770`.
4. Conta dias com chuva inferior a 1 mm; dia utilizÃ¡vel exige ao menos 20 horas
   vÃ¡lidas. Uma cobertura incompleta bloqueia a publicaÃ§Ã£o.
5. Enfileira o primeiro acionamento; sem acionamento, enfileira o Ãºltimo dia.
6. Assina, transmite, aguarda confirmaÃ§Ã£o e relata o recibo ao backend. O contrato
   decide e executa o pagamento integral; o orÃ¡culo nÃ£o transfere a indenizaÃ§Ã£o.

O serviÃ§o usa uma Ãºnica fonte e um Ãºnico operador. Hash comprova integridade em
relaÃ§Ã£o ao pacote contratado, nÃ£o a verdade meteorolÃ³gica nem assinatura do INMET.

```mermaid
flowchart TD
  API[API autenticada] --> V[Conferir termos e serie]
  PAC[Pacote publico INMET] --> V
  TER[Termos na apolice] --> V
  V --> CAL[Calcular estiagem desde o inicio]
  CAL --> FILA[Fila persistente]
  FILA --> PUB[Transmitir ou recuperar transacao]
  PUB --> REC[Recibo confirmado]
  REC --> AUD[Registro local e relato para API]
```

## Executar

Use `npm start` na raiz. O iniciador fornece RPC, chave do orÃ¡culo, autenticaÃ§Ã£o da
API e diretÃ³rio de estado. Os segredos ficam fora do Git; a chave do produtor nÃ£o
Ã© usada pelo orÃ¡culo. A chave de serviÃ§o da API Ã© diferente da chave da blockchain.

Use os comandos abaixo na raiz, com o serviço Docker iniciado:

| Comando | Função |
|---|---|
| `docker compose exec oraculo node src/index.js status` | Conta, saldo e autorização |
| `docker compose exec oraculo node src/index.js fila` | Fila da instância em uso |
| `docker compose exec oraculo node src/index.js estatisticas` | Registros de publicação |
| `docker compose logs --tail 50 oraculo` | Ciclos e falhas do serviço |

Não inicie outro serviço sobre a mesma fila. O estado fica em `.execucao/oraculo`.
O período vem da cobertura histórica, nunca do dia atual.

## Arquivos

| Arquivo em `src/` | Responsabilidade |
|---|---|
| `index.js`, `ciclo.js` | Comandos e execuÃ§Ã£o dos ciclos histÃ³ricos |
| `clienteBackend.js` | Consulta e relatos pela API autenticada |
| `vinculoHistorico.js` | ConferÃªncia dos parÃ¢metros com o compromisso em cadeia |
| `serieHistorica.js` | ConferÃªncia do pacote e da sÃ©rie recebida |
| `historico.js` | Regra de estiagem, sem rede ou gravaÃ§Ã£o |
| `oraculo.js` | Preparo, fila, publicaÃ§Ã£o e auditoria |
| `fila.js` | Estado persistente e retomada |
| `publicador.js`, `abi.js` | ComunicaÃ§Ã£o com o contrato e recibos |
| `registro.js` | ProcedÃªncia, gas e latÃªncia observada |
| `config.js` | ConfiguraÃ§Ã£o por ambiente |

## Falhas e testes

O hash da transaÃ§Ã£o transmitida Ã© salvo antes de esperar a confirmaÃ§Ã£o. Ao retomar,
o serviÃ§o consulta esse hash, sem transmitir outra transaÃ§Ã£o. Uma falha posterior
na auditoria ou no relato nÃ£o transforma pagamento confirmado em novo envio.
GravaÃ§Ãµes da fila usam arquivo temporÃ¡rio e troca de nome. Filas invÃ¡lidas causam
erro explÃ­cito. Tentativas esgotadas exigem revisÃ£o; `fila --reabrir <chave>` deve
ser usado somente apÃ³s conferir o motivo e a cadeia, com o serviÃ§o parado.
HÃ¡ uma janela de falha antes de o RPC devolver o hash; nessa situaÃ§Ã£o, confira a
cadeia antes de reabrir. O contrato impede repetir o mesmo perÃ­odo.

Dentro de `oraculo/`, `npm run cobertura` executa testes unitÃ¡rios e integraÃ§Ã£o em
nÃ³ local. Arquivos, configuraÃ§Ãµes e evidÃªncias ficam em `testes/`. O fluxo completo
API/banco/orÃ¡culo/EVM estÃ¡ em `testes/blockchain/unitarios/FluxoHistorico.test.js`.
Recibos recuperados apÃ³s interrupÃ§Ã£o nÃ£o entram na mÃ©dia de latÃªncia, pois o horÃ¡rio
observado nÃ£o revela quando ocorreu a confirmaÃ§Ã£o original.

A fábrica histórica está implantada e verificada na Sepolia. Testes locais e
serviços ativos não comprovam contratação com MetaMask ou pagamento público.
