# Backend

API do AgroSmart: Node.js + Express 5, sobre PostgreSQL com PostGIS. Código em
[`backend/`](../backend).

Este documento explica **o que o backend faz, o que ele deliberadamente não faz** e por quê. A
referência de comandos está no [README do módulo](../backend/README.md).

---

## 1. O papel do backend na arquitetura

O backend fica inteiro **fora da cadeia**. Ele guarda o que a blockchain não deve guardar:
cadastro, geometria, leituras brutas, sessões e o texto dos termos. Também serve de
ponto de encontro entre as peças fora da cadeia: aplicativo, estações e oráculo.

```
   estações / simulador ──(lote assinado)──►┐
                                            │   BACKEND   ◄──(sessão)── aplicativo
   oráculo ◄──────(chave de serviço)────────┤  (Postgres
                                            │  + PostGIS)
                              indexador ◄───┘
                                  ▲
                                  │ lê eventos
   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~│~ ~ ~ ~ ~ ~ ~ ~  FRONTEIRA  ~ ~ ~ ~ ~ ~ ~ ~ ~
                                  │
                   contratos (apólice, registro, fábrica)
```

Três regras orientam o desenho:

1. **O backend não tem chave privada de ninguém.** Quem emite a apólice é a carteira da
   seguradora; quem publica índices é o oráculo; quem assina lotes de leitura é a fonte. O
   backend só confere assinaturas. Um servidor invadido não consegue emitir apólice nem mover
   valor.
2. **A cadeia é a autoridade, o banco é espelho.** Situação da apólice, valor pago e publicações
   estão no banco para consulta rápida, mas são atualizados pelo indexador a partir dos eventos.
   Onde uma decisão depende do estado (emissão, por exemplo), o backend relê o contrato.
3. **Tudo que atravessa a fronteira pode ser conferido sem confiar no backend.** O resumo dos
   termos é recalculado no navegador; a linha do tempo da apólice é lida da rede, não do banco.

## 2. Banco de dados

### PGlite em desenvolvimento, PostgreSQL em produção

Sem `DATABASE_URL`, o backend usa o **PGlite**: o próprio PostgreSQL compilado para
WebAssembly, rodando dentro do processo Node, com a extensão **PostGIS 3.6** de verdade. Os
dados ficam em `backend/dados/pg/` (fora do git).

Com `DATABASE_URL`, o backend conecta a um PostgreSQL comum pelo driver `pg`. **O SQL é o mesmo
nos dois motores.** A camada de conexão (`src/banco/conexao.js`) só normaliza pequenas
diferenças de retorno, como o nome do campo de linhas afetadas.

Consequência prática: ninguém da equipe precisa instalar banco para rodar o projeto, e a banca
vê o PostGIS funcionando, não uma imitação dele.

### Tabelas

A migração [`001_inicial.sql`](../backend/src/banco/migracoes/001_inicial.sql) cria:

| Grupo | Tabelas | Observação |
|---|---|---|
| Identidade | `usuarios`, `sessoes`, `desafios_carteira`, `auditoria` | senha em bcrypt; segredo TOTP cifrado; sessão guardada como SHA-256 do token |
| Cadastro | `propriedades`, `talhoes`, `produtos` | talhão com `geometry(Polygon, 4326)` e `CHECK (ST_IsValid)` |
| Contratação | `propostas`, `apolices` | proposta guarda o texto canônico dos termos e o resumo |
| Cadeia | `eventos_cadeia`, `estado_indexador` | `UNIQUE (tx_hash, indice_log)`: reprocessar não duplica |
| Dados de campo | `fontes`, `lotes_de_leitura`, `leituras` | `UNIQUE (fonte_id, instante)`: reenvio não duplica |
| Oráculo | `publicacoes_oraculo` | gas, latência e procedência de cada índice |
| Avisos | `notificacoes` | `UNIQUE (usuario_id, tipo, tx_hash)` |

As migrações seguintes acrescentaram:

| Migração | O que acrescenta | Requisito |
|---|---|---|
| `002_origem_da_localizacao.sql` | de onde veio a coordenada de cada foto: `exif`, `dispositivo` ou `manual`. Sem efeito hoje: a tabela `imagens` que recebia essa coluna foi removida pela `007` | RF14 (extinto) |
| `003_cancelamento_e_contestacao.sql` | data de início desejada na proposta; situação `CANCELADA` | RF10 |
| `004_historico_climatico.sql` | `estacoes_inmet` (com posição, para o PostGIS achar as próximas) e `historico_chuva` (chuva diária de 2015 a 2025) | RF06 |
| `005_email.sql` | e-mail do usuário; quando cada aviso saiu por e-mail e quantas tentativas | RF27 |
| `006_coordenada_da_leitura.sql` | coordenada de cada leitura de campo | HU04 |
| `007_remover_visao.sql` | remove `contestacoes`, `analises_de_imagem`, `imagens` e `lotes_de_imagens`; remove o perfil `perito` da constraint de `usuarios`; remove de `produtos` a coluna `operador` e as colunas/constraints de limiar de dano; remove de `publicacoes_oraculo` as colunas `indice_dano_bps` e `confianca_bps` | extinção do RF14–RF17, RF28 e do papel de perito |

As restrições dos produtos (limiares, prazos, percentuais) **espelham as do construtor do
contrato**. Um produto que o contrato recusaria nem chega a ser gravado.

Valores em wei usam `numeric(78,0)`, que cabe um `uint256` inteiro. Trafegam como string no
JSON e são tratados com `BigInt` no código: nenhum valor monetário passa por ponto flutuante.

## 3. Segurança

| Mecanismo | Onde | Requisito |
|---|---|---|
| Senha com bcrypt (custo 12) e comparação com hash fictício para usuário inexistente | `seguranca/cripto.js` | RF01, RNF13 |
| Segundo fator TOTP opcional, ativado só após o primeiro código válido | `rotas/autenticacao.js` | RF01 |
| Segredo TOTP cifrado em repouso (AES-256-GCM) | `seguranca/cripto.js` | RNF14 |
| Token de sessão opaco; o banco guarda só o SHA-256; expira em 8 h | `seguranca/sessoes.js` | RNF13 |
| Perfis produtor e seguradora, conferidos em cada rota | `exigirPerfil` | RF04 |
| Limite de tentativas no login e na ingestão | `express-rate-limit` | RNF13 |
| Chave de serviço para o oráculo, comparada em tempo constante | `exigirServico` | RNF17 |
| Lotes de leitura assinados pela chave da fonte | `dominio/assinaturaDeLote.js` | RNF17 |
| Trilha de auditoria de ações sensíveis | tabela `auditoria` | RNF18 |
| HTTPS com `TLS_CERTIFICADO` e `TLS_CHAVE`; `scripts/gerar-certificados.sh` cria uma autoridade local para desenvolvimento | `index.js` | RNF17 |

Em produção (`NODE_ENV=producao`), o backend **recusa subir** sem `CHAVE_DE_SERVICO` e
`SEGREDO_DE_CIFRA` definidos. Os valores padrão de desenvolvimento nunca vão para produção por
descuido.

### Vínculo de carteira (RF02)

O produtor prova que controla a carteira assinando uma mensagem, sem gastar gas:

1. o servidor gera um desafio com número único e prazo de cinco minutos;
2. a carteira assina (EIP-191);
3. o produtor envia desafio, assinatura **e o endereço que declara possuir**;
4. o servidor recupera o endereço da assinatura e exige que seja igual ao declarado;
5. o desafio é consumido de forma atômica e não serve duas vezes.

O passo 3 corrige um defeito real, descrito em [DECISOES.md §2.11](DECISOES.md).

## 4. Rotas

Todas sob `/api`. Formato de erro único: `{ "erro": { "codigo", "mensagem" } }`.

### Sessão e conta

| Método e caminho | Quem | O que faz |
|---|---|---|
| `POST /autenticacao/entrar` | público | senha → token (ou token parcial, se houver segundo fator) |
| `POST /autenticacao/segundo-fator` | sessão parcial | código TOTP → sessão completa |
| `POST /autenticacao/sair` · `GET /autenticacao/eu` | sessão | encerra / identifica |
| `POST /autenticacao/totp/{iniciar,ativar,desativar}` | sessão | configura o segundo fator |
| `POST /carteira/desafio` · `POST /carteira/vincular` · `DELETE /carteira` | produtor | vínculo de carteira |

### Cadastro

| Método e caminho | Quem | O que faz |
|---|---|---|
| `GET/POST /produtores` · `PATCH /produtores/:id` | seguradora | cadastro e edição de produtores, com senha inicial e e-mail opcional (RF03) |
| `GET /propriedades` · `PATCH /propriedades/:id` | seguradora | propriedades, com nome e município |
| `GET/POST/DELETE /talhoes` · `PATCH /talhoes/:id` | leitura: todos; escrita: seguradora | polígono validado (`ST_IsValid`) e área geodésica pelo PostGIS; edição só sem proposta nem apólice (HU09) |
| `GET/POST/DELETE /produtos` | leitura: todos; escrita: seguradora | produtos de seguro com as restrições do contrato |
| `GET/POST/PATCH /fontes` | seguradora | estações e sensores, com endereço da chave e escore |

### Contratação e apólices

| Método e caminho | Quem | O que faz |
|---|---|---|
| `POST /cotacoes` | produtor | prêmio e limite, calculados em `BigInt`, e o **histórico climático** da localidade: em quantos anos de 2015 a 2025 o produto teria acionado, pela regra do oráculo, com as estações do INMET a até 100 km (RF06; DECISOES 1.17) |
| `POST /propostas` · `GET /propostas` | produtor cria; ambos listam | proposta com área declarada e data de início da cobertura (`inicioDaVigencia`), que abre a janela de cancelamento (RF10) |
| `POST /propostas/:id/preparar` | seguradora | gera o texto canônico, o resumo keccak e a struct pronta para `emitirApolice` |
| `POST /propostas/:id/emissao` | seguradora | recebe o `txHash` e **confere na cadeia**: recibo da fábrica oficial, resumo, produtor e valor |
| `POST /propostas/:id/recusar` | seguradora | recusa com motivo |
| `GET /apolices` · `GET /apolices/:endereco` | participantes | espelho, texto dos termos para conferência, linha do tempo e publicações |

### Dados de campo

| Método e caminho | Quem | O que faz |
|---|---|---|
| `POST /leituras` | fonte (assinatura) | ingestão de lote assinado |
| `GET /leituras` | seguradora | consulta por talhão |

### Oráculo (chave de serviço)

| Método e caminho | O que faz |
|---|---|
| `GET /oraculo/apolices-ativas` | apólices que podem receber publicação, com talhão e fontes |
| `GET /oraculo/leituras` | leituras válidas do talhão, no formato do consolidador do oráculo |
| `POST /oraculo/publicacoes` · `POST /oraculo/falhas` | relato de publicação (gas, latência, procedência) e de falha definitiva |

### Acompanhamento

| Método e caminho | Quem | O que faz |
|---|---|---|
| `GET /notificacoes` · `POST /notificacoes/:id/lida` · `POST /notificacoes/lidas` | sessão | avisos gerados pelos eventos da cadeia (RF27) |
| `GET /relatorios/carteira?de=&ate=&cultura=&regiao=` | seguradora | exposição, prêmios, pagamentos, canceladas, tempo médio de liquidação, quebra por cultura e por município, gas e latência (RF29) |
| `GET /auditoria` | seguradora | trilha de auditoria |
| `GET /saude` | público | banco, cadeia e indexador |

## 5. Contrato de ingestão — para o simulador (HU04)

Esta seção é a **especificação que o simulador em Python precisa seguir**. Já existem duas implementações: o simulador em Python ([`simulador/`](../simulador), que envia
dados reais do INMET) e o script
[`backend/scripts/enviar-leituras.js`](../backend/scripts/enviar-leituras.js), que envia a série
sintética.

Corpo (`POST /api/leituras`, `Content-Type: application/json`):

```json
{
  "lote": "uuid v4 novo a cada envio",
  "fonte": "estacao-inmet-a770",
  "enviadoEm": "2026-09-22T12:00:00Z",
  "leituras": [
    { "instante": "2026-09-21T00:00:00Z", "chuvaMm": 0, "temperaturaC": 31.2, "umidadePct": 38,
      "lon": -47.5794, "lat": -21.4611 }
  ]
}
```

Cabeçalho `X-Assinatura`: assinatura EIP-191 (`personal_sign`) da mensagem

```
AgroSmart:leituras:v1
sha256:<SHA-256 hexadecimal dos bytes exatos do corpo>
```

Em Python, com `eth_account`:

```python
corpo = json.dumps(lote).encode()
mensagem = f"AgroSmart:leituras:v1\nsha256:{hashlib.sha256(corpo).hexdigest()}"
assinatura = Account.sign_message(encode_defunct(text=mensagem), chave).signature.hex()
requests.post(url, data=corpo, headers={"Content-Type": "application/json", "X-Assinatura": assinatura})
```

**Por que assinar os bytes, e não o JSON:** Python e JavaScript serializam números de forma
diferente (`0.0` contra `0`). Assinando os bytes que de fato trafegaram, cada lado só precisa
calcular SHA-256 sobre o mesmo corpo.

A marca de tempo pode vir como `instante` (canônico) ou como `timestamp`, o nome usado pelo
consolidador do oráculo. Os dois são aceitos — ver [DECISOES.md §2.16](DECISOES.md).

A estação pode reportar de hora em hora, como uma estação automática real faz: o oráculo soma a
chuva das horas dentro de cada fonte antes de tirar a média entre fontes.

A API confere, nesta ordem: forma do corpo → fonte ativa → assinatura da chave registrada →
`enviadoEm` dentro de uma janela de 10 minutos → lote ainda não recebido → plausibilidade de
cada leitura. A coordenada (`lon`, `lat`) é opcional; quando vem, precisa cair a até 1 km da
posição cadastrada da fonte — um lote assinado por uma estação com os dados de outra vira leitura
inválida (HU04, critério 4). Leitura implausível **não derruba o lote**: é gravada como inválida, com o motivo,
e reduz a reputação da fonte (média móvel exponencial, α = 0,2). Descartar em silêncio apagaria
a evidência de que o sensor falhou.

## 6. O indexador

`src/cadeia/indexador.js` varre os eventos da fábrica e das apólices com `getLogs`, em blocos,
a cada 4 segundos:

- cada evento é gravado com `(tx_hash, indice_log)` único, então reprocessar é inofensivo;
- depois de cada evento, o estado da apólice é **relido do contrato**, e não deduzido do evento;
- a emissão é registrada também por aqui. Se a seguradora fechar o navegador entre assinar a
  transação e avisar o backend, a apólice aparece mesmo assim;
- cada evento relevante vira notificação para as partes: emissão, garantia, pagamento e
  cancelamento; a falha definitiva de publicação chega pelo relato do
  oráculo (`POST /oraculo/falhas`).

Sem contrato implantado, o indexador fica em espera e a API funciona normalmente. A chave do
progresso inclui o endereço da fábrica: implantar contratos novos recomeça a varredura do bloco
da implantação, sem confundir as duas.

### Avisos por e-mail (RF27)

Um despachante separado do indexador envia por **Nodemailer** os avisos de quem tem e-mail no
cadastro, marca o envio só depois de o servidor aceitar e tenta de novo até 5 vezes. Com
`SMTP_URL` (por exemplo `smtps://usuario:senha@smtp.exemplo.com`), envia de verdade; sem ela,
cada mensagem vira um arquivo `.eml` em `backend/dados/emails/`, que abre em qualquer cliente de
e-mail (DECISOES 1.18).

## 7. Integração com o oráculo

O oráculo continua sendo quem consolida o índice e assina a publicação. O backend só entrega a
matéria-prima e recebe o relato:

```
oraculo servico ──GET /oraculo/apolices-ativas──► backend
               ──GET /oraculo/leituras?talhao──►          (leituras válidas, 90 dias)
               consolida, assina, publica na cadeia
               ──POST /oraculo/publicacoes───►            (gas, latência, procedência)
```

O relato é **melhor esforço**: se o backend estiver fora do ar, a publicação na cadeia acontece
do mesmo jeito, e o registro local do oráculo continua sendo a trilha de auditoria. Um
componente auxiliar fora do ar não pode impedir o pagamento.

Comando: `node src/index.js servico` em `oraculo/`, com `API_URL` e `CHAVE_DE_SERVICO` no
`.env`. Veja [ORACULO.md](ORACULO.md).

## 8. Testes

```
npm run testar              105 testes · banco em memória, cadeia simulada · 79,5% das linhas
npm run testar:integracao     5 testes · indexador contra um hardhat node real
```

Os testes cobrem, entre outros: senha e segundo fator; perfil errado em cada rota sensível;
desafio de carteira reutilizado, expirado ou assinado por outra chave; polígono inválido;
produto fora dos limites do contrato; emissão com recibo de outra fábrica, resumo diferente,
produtor diferente ou valor diferente; lote com assinatura errada, repetido ou fora da janela;
histórico climático com ano incompleto; relatório filtrado; e-mail que falha e é reenviado;
leitura com coordenada longe da fonte.

Medição de desempenho (RNF01), com o backend no ar:

```bash
cd backend && node scripts/medir-consultas.js --usuarios 20 --segundos 30
```

### Verificação ponta a ponta com dados reais (22/09/2026)

Com `hardhat node`, implantação, backend, aplicativo e oráculo rodando juntos:

1. login do produtor e da seguradora pela API;
2. vínculo da carteira com desafio assinado;
3. cotação, proposta, preparação dos termos;
4. emissão assinada pela carteira da seguradora e **conferida pelo backend na cadeia**;
5. depósito da garantia;
6. **2.208 leituras horárias reais** do INMET, das estações A770 (São Simão/SP) e A747
   (Pradópolis/SP), na janela da estiagem de julho e agosto de 2024, enviadas pelo simulador em
   Python em 6 lotes assinados — todas aceitas, reputação 1,00;
7. `oraculo servico --uma-vez`: índice de **39 dias secos** publicado, 248.949 de gas, 31 ms,
   com procedência registrando as duas fontes e as 2.208 leituras válidas;
8. pagamento integral único transferido na mesma transação, sem intervenção humana;
9. o indexador gerou as três notificações (emissão, cobertura ativa, indenização paga);
10. na tela da apólice, o resumo recalculado no navegador bateu com o gravado no contrato, e a
    procedência (2 fontes, gas, latência) apareceu ao lado do índice.

## Regra integral desta revisão

A migração `008_pagamento_integral.sql` desativa produtos antigos parciais e impede produtos ativos incompatíveis. A API só aceita modo 0, teto reservado 0 e limiar positivo. A preparação de propostas antigas parciais responde 409 sem reescrever os termos. Detalhes em [ESCOPO-ATUAL.md](ESCOPO-ATUAL.md).


### Migração de contas do papel retirado

`006_z_arquivar_perfil.sql` é aplicada antes de 007 e preserva as contas antigas e
suas referências, registra o papel em `perfil_legado`, bloqueia o acesso e revoga
sessões. O valor técnico de perfil é normalizado para satisfazer o esquema atual,
mas a conta bloqueada não é um produtor ativo: fica excluída de cadastros e do login.
Isso evita que o banco inicial falhe na remoção do perfil antigo. A migração foi
conferida sobre uma cópia do banco local; o banco original não foi modificado.
O oráculo agora bloqueia o preparo de publicação com menos de duas fontes válidas,
em vez de apenas exibir o alerta herdado; não há alternativa por imagem.

Antes de atualizar um banco persistente, preserve uma copia com o backend parado. A migracao 007 retira tabelas de imagens e laudos; sua finalidade e remover esse subsistema, nao manter seu historico no esquema ativo. As migracoes foram testadas em banco temporario e numa copia do banco antigo.
