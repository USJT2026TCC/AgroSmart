# Oráculo

Serviço que liga os dados do INMET aos contratos. Roda no Docker pelo `npm start` da
raiz e usa a conta de `CHAVE_PRIVADA_ORACULO`, que precisa estar autorizada no
registro de oráculos.

## O que faz, a cada ciclo

1. Pede à API as apólices ativas vinculadas às propostas históricas emitidas.
2. Recebe a série de chuva e os termos de cada apólice.
3. Confere se os termos batem com o hash gravado no contrato e se a série bate com os
   arquivos do INMET do repositório.
4. Conta os dias secos seguidos desde o início da cobertura.
5. Publica no contrato o primeiro dia que atinge o gatilho, ou o último dia da
   cobertura se ele não for atingido. Quem decide e paga é o contrato.
6. Relata à API a confirmação, com gás e horários, ou a falha definitiva.

A fila fica em `.execucao/oraculo/fila.json`. Ela preserva entradas pendentes,
transações enviadas, recibos e falhas. Após reinício, a recuperação de uma transação
conhecida consulta seu recibo. Relatos de confirmação ou falha que não chegaram à
API são tentados novamente, sem reenviar a publicação; um relato que a API recusa
(dados inválidos ou em conflito) não é repetido.

## Comandos

Com o sistema no ar, na raiz do projeto:

| Comando | Mostra |
|---|---|
| `docker compose exec oraculo node src/index.js status` | Conta, saldo e se está autorizado |
| `docker compose exec oraculo node src/index.js fila` | Publicações pendentes e concluídas |
| `docker compose logs --tail 50 oraculo` | O que o serviço fez por último |

O comando `servico` mantém os ciclos; `--uma-vez` executa um ciclo e `--intervalo`
define a espera em milissegundos. As datas avaliadas sempre vêm da cobertura
histórica, não do relógio atual. A configuração é fornecida pelo iniciador e pelo Docker.

## Organização de `src/`

| Arquivo | Função |
|---|---|
| `index.js`, `ciclo.js` | Comandos e ciclo de publicação |
| `clienteBackend.js` | Conversa com a API |
| `historico.js` | Regra de contagem dos dias secos |
| `serieHistorica.js`, `vinculoHistorico.js` | Conferência da série e dos termos |
| `oraculo.js`, `fila.js` | Preparo e fila persistente |
| `publicador.js`, `abi.js` | Envio ao contrato e recibos |
| `config.js` | Configuração |
