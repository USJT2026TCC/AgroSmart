# Como rodar

Passo a passo, da instalação à demonstração. Testado em Windows 11 com Node.js 24.19 e Git 2.55.

---

## 1. Ferramentas

Você precisa de **Git** e **Node.js 20 ou superior**. Para o simulador de estações, também
**Python 3.10 ou superior**.

Conferir o que já está instalado:

```bash
git --version
node --version
npm --version
```

No Windows, se algum não estiver instalado:

```bash
winget install --id Git.Git -e --source winget
```

```bash
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

```bash
winget install --id Python.Python.3.12 -e --source winget
```

Depois de instalar, **feche e abra o terminal** — o `PATH` só é atualizado em sessões novas.

## 2. Clonar e instalar

```bash
git clone https://github.com/USJT2026TCC/AgroSmart.git
```

```bash
cd AgroSmart/contratos && npm install
```

```bash
cd ../oraculo && npm install
```

```bash
cd ../app && npm install
```

```bash
cd ../backend && npm install
```

```bash
cd ../simulador && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"
```

O simulador precisa de Python 3.10 ou superior. No Linux ou macOS, `.venv/bin/python`.

O backend não exige instalar banco: sem `DATABASE_URL`, usa o PGlite, que é o próprio
PostgreSQL com PostGIS rodando dentro do processo.

## 3. Rodar os testes

Os testes não precisam de rede nem de configuração.

| Módulo | Comando | Esperado |
|---|---|---|
| Contratos | `cd contratos && npx hardhat test` | **90 passing** |
| Oráculo | `cd oraculo && npm run testar` | **68 testes, 0 falhas** |
| Backend | `cd backend && npm run testar` | **108 testes, 0 falhas** (banco em memória, cadeia simulada) |
| Aplicativo | `cd app && npm run testar` | **60 testes** (Vitest, telas em jsdom) |
| Simulador | `cd simulador && .venv/Scripts/python -m pytest` | **45 testes** |

Os números de contratos, oráculo, backend e aplicativo caíram em relação à versão anterior com o
módulo de visão computacional, o operador de índice de dano e a contestação/retificação — não é
regressão, é a suíte menor que a versão só-clima exige.

Os testes de integração sobem um `hardhat node` próprio (portas 8599 e seguintes) e rodam contra
ele:

```bash
cd backend && npm run testar:integracao
```

```bash
cd oraculo && npm run testar:integracao
```

Esperado: 5 e 7 testes.

### Cobertura e estilo fora da cadeia (RNF03)

| Módulo | Cobertura | Estilo |
|---|---|---|
| Backend, oráculo | `npm run cobertura` (no oráculo, inclui os testes de integração, que sobem um nó Hardhat) | `npx prettier --check "src/**/*.js" "test/**/*.js"` |
| Aplicativo | `npm run cobertura` | `npx prettier --check "src/**/*.{js,jsx}"` |
| Simulador | `.venv/Scripts/python -m pytest --cov` | `.venv/Scripts/python -m ruff check . && .venv/Scripts/python -m ruff format --check .` |

Esperado: acima de 70% em todos (79,5% a 100% das linhas — backend 79,5%, aplicativo 80,58%,
oráculo 90,7%, contratos 100%) e nenhum aviso de estilo.

### Medições dos requisitos não funcionais

Com o backend no ar e, para as duas do aplicativo, a Sepolia configurada:

| Requisito | Comando |
|---|---|
| RNF01, banco | `cd backend && node scripts/medir-consultas.js --usuarios 20 --segundos 30` |
| RNF01, rede | `cd app && node scripts/medir-leituras.mjs --rede sepolia --blocos 100000` |
| RNF05 | `cd app && node scripts/verificar-navegadores.mjs --rede sepolia --apolice <endereco>` |
| RNF08 | `cd contratos && node scripts/custo-por-apolice.js` |

Resultados de 08/10/2026 em
[resultados/requisitos-nao-funcionais-2026-10-08](resultados/requisitos-nao-funcionais-2026-10-08/README.md).

Cobertura dos contratos:

```bash
cd contratos && npx hardhat clean && npx hardhat coverage
```

Esperado: **100%** em statements, branches, functions e lines para os três contratos de
produção. O `npx hardhat clean` antes não é enfeite — sem ele, o `solidity-coverage` pode medir
uma compilação em cache e devolver números baixos sem motivo.

Relatório de gas:

```bash
cd contratos && npx cross-env REPORT_GAS=true npx hardhat test
```

---

## 4. Demonstração rápida, sem configurar nada

Roda o fluxo inteiro em uma rede em memória: implanta os três contratos, emite a apólice,
deposita a garantia, publica índices crescentes de dias sem chuva e mostra o pagamento
acontecendo sozinho.

```bash
cd contratos && npx hardhat run scripts/demo-estiagem.js
```

Saída esperada, resumida (medida em 16/10/2026, contrato já simplificado — só índice climático):

```
[4/5] Oraculo publica os indices do periodo

      periodo    dias sem chuva   acionou   gas       transacao
      ----------------------------------------------------------------
      20261001            6     nao      140205   0x739fc49cf129a502...
      20261002           13     nao      123105   0x13eaf2e5835dd6fc...
      20261003           21     nao      123105   0xdb29d3e3b9eedbae...
      20261004           28     nao      123105   0x23fae6bb425a143b...
      20261005           33     SIM      182167   0x3a201c2ed9aff681...

[5/5] Resultado
      Situacao da apolice.: LIQUIDADA
      Valor pago..........: 1.0 ETH
      Garantia restante...: 0.0 ETH
```

Esse script exercita só os contratos. Para ver o **serviço de oráculo** funcionando, siga a
seção 5.

---

## 5. Fluxo completo com o serviço de oráculo

Precisa de **dois terminais**.

### Terminal 1 — a rede local

```bash
cd contratos && npx hardhat node
```

Deixe rodando. Ele imprime vinte contas com saldo e as respectivas chaves privadas. A convenção
do projeto é:

| Conta | Papel |
|---|---|
| #0 | Seguradora |
| #1 | Produtor |
| #2 | **Oráculo** — é esta chave que você vai copiar |

> Essas chaves são públicas e conhecidas. Servem só para rede local. Nunca envie valor real
> para elas.

### Terminal 2 — implantar e emitir a apólice

```bash
cd contratos && npx hardhat run scripts/implantar.js --network localhost
```

Implanta o `OracleRegistry` e a `ApoliceFactory`, autoriza o endereço do oráculo e grava tudo em
`contratos/implantacoes/localhost.json`. Nenhum endereço precisa ser copiado à mão: o serviço de
oráculo lê esse arquivo.

```bash
cd contratos && npx hardhat run scripts/emitir-apolice.js --network localhost
```

Emite a apólice, deposita a garantia de 1 ETH e imprime, ao final, a linha pronta para colar no
`.env` do oráculo.

### Terminal 2 — configurar o oráculo

```bash
cd oraculo && copy .env.example .env
```

No Linux ou macOS, `cp .env.example .env`.

Preencha duas linhas:

```
CHAVE_PRIVADA_ORACULO=<a chave da conta #2 impressa pelo hardhat node>
ENDERECO_APOLICE=<o endereço impresso por emitir-apolice.js>
```

Confira que está tudo no lugar:

```bash
cd oraculo && node src/index.js status
```

A linha `Autorizado a publicar` precisa dizer **sim**.

### Terminal 2 — rodar o cenário

```bash
cd oraculo && node src/index.js ciclo --cenario estiagem_severa --com-falhas
```

O oráculo consolida o índice de cada período, descarta as leituras defeituosas, publica na
cadeia e para quando o pagamento acontece.

Para acompanhar os eventos em tempo real, em um terceiro terminal antes de rodar o ciclo:

```bash
cd oraculo && node src/index.js ouvir
```

E para ver os números coletados:

```bash
cd oraculo && node src/index.js estatisticas
```

---

## 5A. A demonstração completa, pelo aplicativo

Este é o roteiro de cinco minutos do capítulo 1 do manual da equipe. Precisa de **quatro
terminais** e do navegador.

### Terminal 1 — a rede local

```bash
cd contratos && npx hardhat node
```

### Terminal 2 — implantar

```bash
cd contratos && npx hardhat run scripts/implantar.js --network localhost
```

Não é preciso emitir a apólice por script: ela será contratada pelo aplicativo.

### Terminal 3 — o backend

```bash
cd backend && npm run iniciar
```

Na primeira execução, cria o banco em `backend/dados/pg/` com os usuários, talhões, produtos e
fontes de demonstração. O indexador começa a acompanhar a fábrica implantada no passo anterior.

> Se a rede local foi reiniciada, o banco guarda apólices de uma cadeia que não existe mais.
> Preserve o banco anterior. Para uma nova demonstração, defina `DIR_BANCO` com um novo diretório antes de iniciar a API; não reutilize apólices de uma cadeia reiniciada.

### Terminal 4 — o aplicativo

```bash
cd app && npm run dev
```

Abra `http://localhost:5173`. Sem MetaMask instalada, use
`http://localhost:5173/?carteira=simulada&conta=1` — a faixa de aviso deixa claro que a carteira
é simulada, então isso serve para desenvolvimento, não para a apresentação.

### No navegador

1. **Entrar como produtor** (`produtor` / `agrosmart`). Em *Minha carteira*, conectar e assinar
   o vínculo.
2. **Simular e contratar**: escolher o talhão, o produto integral e conferir a tabela de
   exemplos. Enviar a proposta.
3. **Sair e entrar como seguradora** (`seguradora` / `agrosmart`), com a carteira da conta 0.
4. Em *Propostas*: **Emitir apólice na rede** e depois **Depositar garantia**. O backend confere
   a emissão na cadeia antes de registrá-la.
5. Abrir a apólice pelo link **Ver apólice** e deixar essa tela visível. O cartão *Conferência
   dos termos* deve dizer que o texto corresponde ao resumo gravado no contrato.

### Terminal 2 — as estações enviam leituras reais

Na primeira vez, baixe o ano de 2024 do INMET (~100 MB):

```bash
cd simulador && .venv/Scripts/python -m simulador baixar --ano 2024
```

Depois, as duas estações enviam a estiagem real de São Simão:

```bash
cd simulador && .venv/Scripts/python -m simulador enviar --estacao A770 --ano 2024 --de 2024-06-25 --ate 2024-08-09 --fonte estacao-inmet-a770 --ate-hoje
```

```bash
cd simulador && .venv/Scripts/python -m simulador enviar --estacao A747 --ano 2024 --de 2024-06-25 --ate 2024-08-09 --fonte estacao-inmet-a747 --ate-hoje
```

As chaves das estações de demonstração vêm do `.env` do simulador. Cada lote é assinado pela
chave da estação, e a API confere a assinatura antes de aceitar. O comando imprime o período que
deve ser passado ao oráculo — anote.

> Para uma demonstração sem baixar dado nenhum, o caminho antigo continua valendo:
> `cd backend && npm run enviar-leituras -- --cenario estiagem_severa` usa a série sintética.

### Terminal 2 — o oráculo publica

Em `oraculo/.env`, além da chave da conta 2, defina:

```
API_URL=http://localhost:3001/api
CHAVE_DE_SERVICO=desenvolvimento-apenas-nao-use-em-producao
```

```bash
cd oraculo && node src/index.js servico --uma-vez --periodo <o periodo impresso acima>
```

O oráculo pergunta ao backend quais apólices estão ativas, busca as leituras do talhão,
consolida, publica e relata o resultado. Com a estiagem real de 39 dias, o pagamento acontece na
mesma transação, e **a linha do tempo na tela cresce sozinha**, sem recarregar, até
"Indenização transferida ao produtor sem intervenção humana". O link *Avisos*, no cabeçalho, mostra as
notificações de emissão, cobertura e pagamento.

Sem `--uma-vez`, o serviço repete o ciclo a cada minuto, como rodaria em produção.

Para o roteiro antigo, que mostra o índice subindo 28 → 29 → 30 um dia de cada vez, use
`node src/index.js ciclo --cenario estiagem_severa` com `ENDERECO_APOLICE` no `.env`.

O pagamento é integral e único. Após a liquidação, não há saldo regular da garantia nem complementação de indenização.

### No navegador — cancelar (RF10)

**Cancelar.** A apólice precisa começar no futuro. Na cotação, escolha um **Início da cobertura**
daqui a alguns dias; emitida e com a garantia depositada, o detalhe da apólice mostra **Cancelar
apólice** para o produtor titular e para a seguradora. Confirmado, a carteira assina, a situação
passa a *cancelada* e a garantia volta à seguradora. Por script, sem a interface:

```bash
cd contratos && npx hardhat run scripts/cancelar-apolice.js --network localhost
```

com `ENDERECO_APOLICE` definido antes (no PowerShell, `$env:ENDERECO_APOLICE="0x..."`).

---

## 6. Verificar o comportamento sob falha (RF21)

Essa é uma das quatro medidas experimentais previstas no manual da equipe.

Com a rede local rodando e a apólice ativa, use um endpoint que não existe:

```bash
cd oraculo && node src/index.js publicar --periodo 20261020 --cenario estiagem_moderada
```

Antes, no `.env`, troque `RPC_URL` para `http://127.0.0.1:9999`. O serviço consolida o índice,
grava na fila e falha nas tentativas, registrando `ECONNREFUSED`.

Confira que o índice **não se perdeu**:

```bash
cd oraculo && node src/index.js fila
```

Devolva o `RPC_URL` ao valor correto, reabra a entrada e publique de novo:

```bash
cd oraculo && node src/index.js fila --reabrir <a chave mostrada acima>
```

```bash
cd oraculo && node src/index.js publicar --periodo 20261020 --cenario estiagem_moderada
```

A mensagem `Entrada ja existia na fila; retomando em vez de duplicar` confirma que o período de
referência original foi preservado.

---

## 7. Rede de teste pública (Sepolia)

Executado de ponta a ponta em 07/10/2026, com os dois pagamentos confirmados na rede:
[resultados/sepolia-2026-10-07](resultados/sepolia-2026-10-07/README.md). A versão com cancelamento
e contestação foi implantada e verificada no Etherscan em 08/10/2026:
[resultados/sepolia-2026-10-08](resultados/sepolia-2026-10-08/README.md). Os endereços estão em
`contratos/implantacoes/sepolia.json`. Os passos 7.1 a 7.3 só são necessários para uma implantação
nova.

### 7.1 Carteiras e ETH de teste

São três endereços distintos (RNF10), todos de carteiras **só de teste**:

| Papel | Onde fica a chave |
|---|---|
| Seguradora | `contratos/.env` (`CHAVE_PRIVADA_SEGURADORA`), e importada na MetaMask para usar o aplicativo |
| Oráculo | `contratos/.env` e `oraculo/.env.sepolia` (`CHAVE_PRIVADA_ORACULO`); nunca vai para a MetaMask |
| Produtor | só na MetaMask de quem faz o papel de produtor; o sistema conhece apenas o endereço |

Uma carteira nova se gera com:

```bash
node -e "const w=require('./contratos/node_modules/ethers').Wallet.createRandom(); console.log(w.address)"
```

O comando acima imprime só o endereço, para mostrar o formato. Para gravar a chave, escreva-a
direto no `.env` por um script, nunca copiando de um terminal ou de um chat.

O ETH de teste vai para a seguradora, por um faucet: Google Cloud Web3 Faucet (conta Google),
Alchemy (conta grátis) ou o PoW Faucet de pk910 (sem conta). 0,05 ETH sobram para a
demonstração inteira, com o preço do gas configurado (7.2). Depois, a seguradora repassa
0,002 ETH ao oráculo, que paga o gas das publicações.

### 7.2 Configurar

```bash
cd contratos && copy .env.example .env
```

| Variável | Valor |
|---|---|
| `RPC_SEPOLIA` | `https://ethereum-sepolia-rpc.publicnode.com` — público, sem conta. O `rpc.sepolia.org` saiu do ar |
| `CHAVE_PRIVADA_SEGURADORA`, `CHAVE_PRIVADA_ORACULO` | as chaves de teste |
| `ENDERECO_ORACULO`, `ENDERECO_PRODUTOR` | os endereços correspondentes |
| `PRECO_GAS_GWEI` | `0.01`. **Não deixe em branco**: o Hardhat pagaria mil vezes o preço da rede (DECISOES.md 2.24) |
| `VALOR_INDENIZACAO` | `0.01` — o padrão de 1 ETH esgota o faucet |

O oráculo lê `oraculo/.env.sepolia`, uma cópia do `.env.example` com `REDE=sepolia`, o mesmo
`RPC_URL`, `CHAVE_PRIVADA_ORACULO`, `CONFIRMACOES=2`,
`CHAVE_DE_SERVICO=desenvolvimento-apenas-nao-use-em-producao` e `DIR_DADOS=dados-sepolia`. O
`.env` da rede local continua intacto; `ARQUIVO_ENV` escolhe qual dos dois usar.

### 7.3 Implantar e emitir

```bash
cd contratos && npx hardhat run scripts/implantar.js --network sepolia
```

Apólice pelo índice climático (30 dias sem chuva):

```bash
cd contratos && npx hardhat run scripts/emitir-apolice.js --network sepolia
```

Apólice que pode ser cancelada (RF10): defina antes `$env:INICIO_EM_DIAS="10"`; a vigência começa
daqui a 10 dias. Para cancelar, com `$env:ENDERECO_APOLICE` apontando para ela:

```bash
cd contratos && npx hardhat run scripts/cancelar-apolice.js --network sepolia
```

Pela Sepolia, cada emissão leva cerca de 30 segundos e custa ~14 milhões de gas — 0,00014 ETH a
0,01 gwei. O cancelamento custa 43 mil.

### 7.4 O backend acompanhando a Sepolia

Com banco próprio, para não misturar com as apólices da rede local. No PowerShell:

```
$env:REDE="sepolia"; $env:RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"; $env:DIR_BANCO="dados/pg-sepolia"
```

```bash
cd backend && npm run iniciar
```

O indexador lê os eventos da fábrica desde o bloco da implantação e registra sozinho as apólices
emitidas por script, ligando-as ao talhão pelo identificador gravado no contrato.

### 7.5 Pagamento pelo índice climático

As duas estações enviam a estiagem real, como no 5A:

```bash
cd simulador && .venv/Scripts/python -m simulador enviar --estacao A770 --ano 2024 --de 2024-06-25 --ate 2024-08-09 --fonte estacao-inmet-a770 --ate-hoje
```

```bash
cd simulador && .venv/Scripts/python -m simulador enviar --estacao A747 --ano 2024 --de 2024-06-25 --ate 2024-08-09 --fonte estacao-inmet-a747 --ate-hoje
```

O oráculo publica, com o período impresso pelo simulador. No PowerShell, antes:
`$env:ARQUIVO_ENV=".env.sepolia"`.

```bash
cd oraculo && node src/index.js servico --uma-vez --periodo <o periodo impresso>
```

A linha da apólice termina em `SIM` e no identificador da transação. Cole-o em
`https://sepolia.etherscan.io`: a mesma transação publica o índice e transfere a indenização.

### 7.6 Verificar o código no Etherscan

Feito em 08/10/2026. Precisa de uma chave grátis da API do Etherscan em `ETHERSCAN_API_KEY`, no
`contratos/.env`.

```bash
cd contratos && npx hardhat verify --network sepolia <endereco do OracleRegistry> <endereco da seguradora>
```

```bash
cd contratos && npx hardhat verify --network sepolia <endereco da ApoliceFactory> <endereco do OracleRegistry> <endereco da seguradora>
```

Cada apólice recebe os termos no construtor; o script lê da própria cadeia e verifica, com
`$env:ENDERECO_APOLICE` definido:

```bash
cd contratos && npx hardhat run scripts/verificar-apolice.js --network sepolia
```

Logo depois da implantação o Etherscan pode responder que o endereço não tem código: é o tempo de
ele indexar o bloco. Espere um minuto.

---

## 8. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `git`/`node` não reconhecido logo após instalar | O `PATH` do terminal é antigo | Feche e abra o terminal |
| `Implantacao nao encontrada` | O script de implantação não rodou nessa rede | Rode `implantar.js --network <rede>` |
| `Autorizado a publicar: NAO` | A chave do `.env` não é a do endereço autorizado | Confira que é a conta #2, ou autorize o endereço no registro |
| `SituacaoInvalida(2, 1)` ao publicar | A apólice já foi liquidada | Emita uma apólice nova com `emitir-apolice.js` |
| `PeriodoJaPublicado` | Esse período já entrou na cadeia | Use outro `--periodo`; é o RF20 funcionando |
| Cobertura com números baixos sem motivo | Cache do `solidity-coverage` | `npx hardhat clean` antes de `npx hardhat coverage` |
| O comando termina de imprimir e não devolve o terminal | Versão antiga, anterior ao `provider.destroy()` | Atualize o repositório |
| O aplicativo abre, mas nenhuma apólice aparece | Os endereços no app estão desatualizados | Rode `npm run enderecos` em `app` depois de reimplantar |
| `Nenhum contrato implantado nesta rede` na tela de login | O script de implantação não rodou | Rode `implantar.js` e depois `npm run enderecos` |
| Botão de emitir desabilitado | A carteira conectada não é a da seguradora | Troque para a conta 0 do `hardhat node` |
| `nonce has already been used` | Versão antiga, anterior ao `NonceManager` | Atualize o repositório |

---

## 9. Regras de trabalho da equipe

- Ninguém commita direto na branch principal. Sempre branch própria e pull request.
- Todo pull request precisa da revisão de pelo menos uma outra pessoa.
- Uma tarefa só está pronta quando: o código está na principal, tem teste, e outra pessoa
  conseguiu rodar na máquina dela.
- Chave privada e senha **nunca** entram no repositório. Só no `.env` local.

## Validação do recorte atual

Leia [ESCOPO-ATUAL.md](ESCOPO-ATUAL.md). Para o roteiro automático local, execute `npx hardhat run scripts/avaliar-integral.js` dentro de `contratos/`. O script exige a rede efêmera Hardhat, confere pagamento integral, rejeição de segundo acionamento e cancelamento. Os endereços públicos anteriores estão marcados como legados; uma nova demonstração na Sepolia requer reimplantação e verificação do código atual.

Antes de atualizar um banco persistente, preserve uma copia com o backend parado. A migracao 007 retira tabelas de imagens e laudos; sua finalidade e remover esse subsistema, nao manter seu historico no esquema ativo. As migracoes foram testadas em banco temporario e numa copia do banco antigo.
