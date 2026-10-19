# Rastreabilidade

Cada requisito, história de usuário e caso de uso da **Entrega 3** da documentação de software,
ligado ao código que o implementa, ao teste que o comprova e à evidência medida. Revisado em 16/10/2026 para o protocolo clima-integral-v1.

**Situação da revisão de 16/10/2026:** a matriz abaixo conserva identificadores históricos, com itens retirados explicitamente indicados. Aprovação de testes e metas medidas estão em [resultados atuais](resultados/clima-integral-2026-10-16/README.md); evidências da Sepolia de versões antigas não validam este código.

**Nesta cópia**, o módulo de visão computacional, o índice de dano, o papel de perito e a
contestação/retificação foram removidos (ver DECISOES.md): RF14 a RF17, RF28, RNF02, RNF19,
HU11, UC08, UC09 e UC14 deixam de existir, e o RNF16 passa a exigir só duas fontes climáticas
independentes.

Convenções: caminhos relativos à raiz do repositório; `DECISOES n` aponta para a seção de
[DECISOES.md](DECISOES.md); "Sepolia 07/10" e "Sepolia 08/10" são
[resultados/sepolia-2026-10-07](resultados/sepolia-2026-10-07/README.md) e
[resultados/sepolia-2026-10-08](resultados/sepolia-2026-10-08/README.md); "Medições" é
[resultados/requisitos-nao-funcionais-2026-10-08](resultados/requisitos-nao-funcionais-2026-10-08/README.md).

---

## 1. Requisitos funcionais

### Identidade e acesso

| RF | Requisito | Implementação | Testes |
|---|---|---|---|
| RF01 | Login com identificador, senha e segundo fator | `backend/src/rotas/autenticacao.js` (bcrypt, TOTP com segredo cifrado); `app/src/paginas/Entrar.jsx`, `Conta.jsx` | `backend/test/autenticacao.test.js`; `app/test/telas/autenticacao.test.jsx`, `produtor.test.jsx` |
| RF02 | Carteira vinculada por assinatura de mensagem | `backend/src/rotas/carteira.js` (desafio único, `verifyMessage`); `app/src/paginas/produtor/VincularCarteira.jsx` | `backend/test/carteira.test.js`; `app/test/telas/produtor.test.jsx` |
| RF03 | Cadastro e edição de produtores, propriedades e talhões em polígono | `backend/src/rotas/cadastro.js` (PostGIS, `ST_IsValid`); `app/src/componentes/DesenhoDoTalhao.jsx` (Leaflet), importação de GeoJSON | `backend/test/cadastro.test.js`; `app/test/telas/seguradora.test.jsx`, `app/test/geografia.test.mjs` |
| RF04 | Acesso por perfil | `backend/src/seguranca/sessoes.js` (`exigirPerfil`); `app/src/componentes/RotaProtegida.jsx`, `app/src/sessao/perfis.js` | `backend/test/autenticacao.test.js`; `app/test/telas/autenticacao.test.jsx` |

### Ciclo da apólice

| RF | Requisito | Implementação | Testes e evidência |
|---|---|---|---|
| RF05 | Produtos indexados | `backend/src/rotas/cadastro.js` (produtos); `app/src/paginas/seguradora/TalhoesEProdutos.jsx` | `backend/test/cadastro.test.js`; `app/test/telas/seguradora.test.jsx` |
| RF06 | Cotação pela área, cultura e histórico climático | `backend/src/dominio/cotacao.js`, `historicoClimatico.js` (INMET 2015–2025, estações a até 100 km, regra do oráculo); `app/src/paginas/produtor/Cotacao.jsx` | `backend/test/historicoClimatico.test.js`, `propostas.test.js`; `app/test/telas/cotacao.test.jsx` · DECISOES 1.17 |
| RF07 | Contrato implantado na contratação | `contratos/contracts/ApoliceFactory.sol` (`emitirApolice`); `backend/src/rotas/propostas.js`; `app/src/paginas/seguradora/Propostas.jsx` | `contratos/test/ApoliceFactory.test.js`; `backend/test/propostas.test.js` · Sepolia 07/10 e 08/10 |
| RF08 | Resumo criptográfico dos termos | `ApolicePolicy.sol` (`hashTermos`); `backend/src/dominio/termos.js`; conferência no navegador em `app/src/paginas/ApoliceDetalhe.jsx` | `contratos/test/ApolicePolicy.test.js`; `backend/test/propostas.test.js`; `app/test/telas/apolice.test.jsx` (termos adulterados denunciados) |
| RF09 | Linha do tempo pelos eventos, com o identificador de cada transação | `app/src/cadeia/contratos.js` (`lerLinhaDoTempo`, leitura em trechos); `ApoliceDetalhe.jsx` com link ao Etherscan | `app/test/telas/apolice.test.jsx`, `app/test/eventosEmTrechos.test.mjs` · DECISOES 2.29 |
| RF10 | Cancelamento antes da vigência, liberando a garantia | `ApolicePolicy.sol` (`cancelar`); `contratos/scripts/cancelar-apolice.js`; botão em `ApoliceDetalhe.jsx` | `contratos/test/Cancelamento.test.js`; `app/test/telas/apolice.test.jsx` · Sepolia 08/10 · DECISOES 1.15 |

### Coleta e validação de dados de campo

| RF | Requisito | Implementação | Testes |
|---|---|---|---|
| RF11 | Coleta automática em periodicidade configurável | `simulador/` (`--intervalo`, API ou MQTT, série real do INMET); `backend/src/rotas/leituras.js`; oráculo com `INTERVALO_SERVICO_MS` | `simulador/tests/test_cli.py`, `test_cenarios.py`; `backend/test/leituras.test.js` |
| RF12 | Plausibilidade e fontes inoperantes | `oraculo/src/consolidador.js` (`validarLeitura`, faixas físicas), usada também pelo backend; coordenada conferida contra a fonte | `oraculo/test/consolidador.test.js`; `backend/test/leituras.test.js` |
| RF13 | Reputação com limiar mínimo | `oraculo/src/reputacao.js`; `backend/src/dominio/leituras.js` (`atualizarEscore`) | `oraculo/test/reputacao.test.js`; `backend/test/leituras.test.js` |

### Oráculo e ponte

| RF | Requisito | Implementação | Testes e evidência |
|---|---|---|---|
| RF18 | Lista de endereços autorizados | `contratos/contracts/OracleRegistry.sol`; `app/src/paginas/seguradora/Oraculos.jsx` | `contratos/test/OracleRegistry.test.js`, `Seguranca.test.js` |
| RF19 | Índices consolidados, assinados e publicados em uma transação | `oraculo/src/consolidador.js`, `publicador.js` (`publicarIndices`) | `oraculo/test/consolidador.test.js`; `oraculo/integracao/oraculo.test.js` · Sepolia 07/10 |
| RF20 | Publicação duplicada recusada | `ApolicePolicy.sol` (`PeriodoJaPublicado`) | `contratos/test/ApolicePolicy.test.js` |
| RF21 | Fila de retomada preservando o período | `oraculo/src/fila.js` (persistida em disco) | `oraculo/test/fila.test.js`; `oraculo/integracao/oraculo.test.js` (falhas injetadas) |
| RF22 | Transação, gas e instante de confirmação registrados | `oraculo/src/registro.js`; `backend/src/rotas/oraculo.js` (relato ao backend) | `oraculo/test/registro.test.js`; `backend/test/oraculo.test.js` |

### Contrato e liquidação

| RF | Requisito | Implementação | Testes e evidência |
|---|---|---|---|
| RF23 | Condição avaliada a cada publicação, sem intervenção | `ApolicePolicy.sol` (`publicarIndices` avalia e emite `CondicaoAvaliada`; `_liquidarSeAtendida`, `_percentualDevido`) | `contratos/test/ApolicePolicy.test.js`, `RegraDeGatilho.test.js` |
| RF24 | Indenização transferida logo após o acionamento | `ApolicePolicy.sol` (`_liquidarSeAtendida`), na mesma transação | `contratos/test/ApolicePolicy.test.js` · Sepolia 07/10 (histórico de versão anterior); teste atual em `scripts/avaliar-integral.js` |
| RF25 | Indenização integral de 100% em parcela única; configurações parciais recusadas | `ApolicePolicy.sol` (`_percentualDevido`, construtor); `app/src/cadeia/regraDeGatilho.js`; API e migração 008 | `contratos/test/RegraDeGatilho.test.js` (contrato e aplicativo, caso a caso) |
| RF26 | Sem acionamento duplicado; falha na transferência não deixa estado inconsistente | `ApolicePolicy.sol` (verificação, efeitos, interação; guarda de reentrância) | `contratos/test/Seguranca.test.js` (contrato malicioso, `ProdutorQueRecusa`) |

### Notificação e gestão

| RF | Requisito | Implementação | Testes e evidência |
|---|---|---|---|
| RF27 | Notificação de acionamento, pagamento e falha de publicação | `backend/src/cadeia/indexador.js` (eventos → avisos); `backend/src/rotas/oraculo.js` (falha relatada pelo oráculo); `backend/src/notificacoes/email.js` (Nodemailer) | `backend/test/email.test.js`, `oraculo.test.js`; `backend/integracao/indexador.test.js`; `app/test/telas/produtor.test.jsx` · DECISOES 1.18 |
| RF29 | Relatórios com filtros por período, cultura e região | `backend/src/rotas/acompanhamento.js`; `app/src/paginas/seguradora/CarteiraDaSeguradora.jsx` | `backend/test/relatorios.test.js`; `app/test/telas/seguradora.test.jsx` |

---

## 2. Requisitos não funcionais

### Qualidade geral

| RNF | Requisito | Como é atendido | Evidência |
|---|---|---|---|
| RNF01 | 95% das consultas pelo banco em até 2 s; leituras da rede medidas | Consultas indexadas por endereço e carteira; eventos lidos em trechos | p95 de 90 ms com 20 usuários; tela de detalhe em 0,8 s na Sepolia · Medições |
| RNF03 | Guia de estilo e cobertura mínima de 70% fora da cadeia | Prettier (JavaScript) e ruff (Python), configurados no repositório | 79,5% a 100% por módulo (contratos 100%, oráculo 90,7%, aplicativo 80,9%, backend 79,5%) — medido em 16/10/2026 |
| RNF04 | Condições em linguagem simples, com exemplos que acionam e que não acionam | `Cotacao.jsx`, `app/src/cadeia/regraDeGatilho.js` (exemplos calculados pela mesma regra do contrato) | `contratos/test/RegraDeGatilho.test.js`; `app/test/telas/cotacao.test.jsx` |
| RNF05 | Chrome, Firefox e Edge, com carteira injetada | Provedor EIP-1193; pacote para `baseline-widely-available` | Chrome 154 e Edge 153 por `app/scripts/verificar-navegadores.mjs` · Medições |

### Execução em cadeia

| RNF | Requisito | Como é atendido | Evidência |
|---|---|---|---|
| RNF06 | Lógica determinística | Sem aleatoriedade; o tempo do bloco só decide a vigência, nunca entropia | Slither sem achados · [ANALISE-ESTATICA.md](ANALISE-ESTATICA.md) |
| RNF07 | Gas medido; nenhuma função acima do limite do bloco | `hardhat-gas-reporter`; a operação mais cara, implantar a fábrica, usa 3,2% do limite do bloco na rede local; `emitirApolice`, 2,3% | [CONTRATOS.md §4](CONTRATOS.md) |
| RNF08 | Custo do ciclo até 1% do prêmio | Publicação diária; agregação documentada | 0,35% na Sepolia; acima de 1% na rede principal para apólices pequenas · Medições |
| RNF09 | Imune a reentrância | Verificação, efeitos, interação; `naoReentrante` | `contratos/test/Seguranca.test.js` (ataque falha) |
| RNF10 | Controle de acesso por papel | Modificadores de seguradora, oráculo autorizado e produtor titular | `contratos/test/*.test.js` (caminhos de recusa) · carteiras distintas na Sepolia |
| RNF11 | Análise estática antes da implantação | Slither | Nenhum achado aberto · [ANALISE-ESTATICA.md](ANALISE-ESTATICA.md) |
| RNF12 | 100% dos caminhos condicionais | `solidity-coverage` | 100% de comandos, ramos, funções e linhas · 89 testes |
| RNF13 | Atomicidade | Publicação e pagamento na mesma transação; falha reverte tudo | `contratos/test/Seguranca.test.js` (`ProdutorQueRecusa`) |
| RNF14 | Chave da seguradora fora do código | `.env` no `.gitignore`; modelos em `.env.example` | Nenhum arquivo `.env` em todo o histórico do repositório (`git log --all`) |
| RNF15 | Chave do produtor nunca armazenada | Vínculo por assinatura; a chave fica na MetaMask | `backend/test/carteira.test.js` · produtor da Sepolia criado na MetaMask |

### Oráculo e dados

| RNF | Requisito | Como é atendido | Evidência |
|---|---|---|---|
| RNF16 | Duas fontes climáticas independentes | `oraculo/src/consolidador.js` (`minimoDeFontes = 2`); aviso no cadastro do talhão | `oraculo/test/consolidador.test.js` · A770 e A747 na demonstração |
| RNF17 | Leitura autenticada na origem e por canal cifrado | Lote assinado pela chave da fonte; HTTPS no backend e TLS no MQTT, com o certificado conferido | `backend/test/leituras.test.js`; `simulador/tests/test_cli.py` |
| RNF18 | Decisão reconstituível pela cadeia | Índices e transações nos eventos; linha do tempo lida da rede | `app/test/telas/apolice.test.jsx` · links do Etherscan nos resultados da Sepolia |
| RNF20 | Indisponibilidade não perde dados | Leituras no banco; fila do oráculo em disco, com o período original | `oraculo/integracao/oraculo.test.js`; `oraculo/test/fila.test.js` |
| RNF21 | Indenização em até 72 h do acionamento | Pagamento na mesma transação da publicação | ~27 s na Sepolia; 0,89 h do fim do dia acionador · Medições |

---

## 3. Histórias de usuário e critérios de aceite

| HU | Critérios | Onde se comprova |
|---|---|---|
| HU01 Contrato em rede local | 1 construtor com condição, carteira e oráculo · 2 resumo dos termos legível · 3 implantação válida e inválida · 4 gas da implantação | `contratos/test/ApolicePolicy.test.js`, `ApoliceFactory.test.js`; CONTRATOS.md §4 |
| HU02 Endereços autorizados | 1 não autorizado revertido com motivo · 2 período duplicado revertido · 3 só a seguradora autoriza · 4 evento a cada publicação · 5 os três caminhos | `contratos/test/OracleRegistry.test.js`, `ApolicePolicy.test.js` |
| HU03 Liquidação atômica | 1 verificar, atualizar, transferir · 2 guarda de reentrância · 3 duplicado rejeitado · 4 falha não altera a situação · 5 ataque de reentrância falha | `contratos/test/Seguranca.test.js` |
| HU04 Simulador | 1 MQTT em intervalo configurável · 2 série do INMET · 3 três cenários · 4 data, hora, fonte e **coordenada** em cada leitura | `simulador/tests/test_cli.py`, `test_cenarios.py`, `test_serie.py`; `backend/test/leituras.test.js` (critério 4, corrigido em 08/10) |
| HU05 Consolidação | 1 fora de faixa descartada e registrada · 2 fonte inoperante · 3 reputação a cada ciclo · 4 fontes usadas registradas | `oraculo/test/consolidador.test.js`, `reputacao.test.js`; `backend/test/leituras.test.js` |
| HU06 Publicação assinada | 1 dois índices em uma transação · 2 chave por variável de ambiente · 3 transação, gas e instante gravados · 4 evento capturado | `oraculo/test/registro.test.js`; `oraculo/integracao/oraculo.test.js`; `backend/integracao/indexador.test.js` |
| HU07 Vínculo da carteira | 1 mensagem única · 2 assinatura verificada no servidor · 3 chave nunca trafega · 4 endereço de outro produtor recusado | `backend/test/carteira.test.js`; `app/test/telas/produtor.test.jsx` |
| HU09 Talhões e produtos | 1 desenhado no mapa ou importado em GeoJSON · 2 área calculada · 3 autointerseção recusada · 4 produto completo | `backend/test/cadastro.test.js`; `app/test/telas/seguradora.test.jsx` |
| HU10 Cotação e contratação | 1 prêmio, limite e condição em linguagem simples · 2 exemplo do que aciona e não aciona · 3 implantação e endereço exibido · 4 falha não registra a apólice | `app/test/telas/cotacao.test.jsx`, `seguradora.test.jsx`; `backend/test/propostas.test.js` (transação revertida não registra apólice; a apólice só entra pelo recibo) |
| HU13 Autenticação e perfis | 1 senha com hash e sal · 2 menus por perfil · 3 sessão expirada volta ao login · 4 rota de outro perfil recusada | `backend/test/autenticacao.test.js`; `app/test/telas/autenticacao.test.jsx` |
| HU12 (reserva) Linha do tempo | RF09 | ver RF09 |
| HU14 (reserva) Notificações | RF27 | ver RF27 |

HU11 (Área afetada, por visão computacional) deixou de existir junto com o módulo de visão.

O Quadro 18 também deixa em reserva a HU08 (RF21), o RF10, o RF25 e o RF29: todos
implementados (DECISOES 4). RF17 e RF28, também citados ali na versão anterior, foram extintos
com o módulo de visão computacional.

---

## 4. Casos de uso

| UC | Caso de uso | Onde está |
|---|---|---|
| UC01 | Autenticar-se | RF01, RF04 · `Entrar.jsx`, `rotas/autenticacao.js` |
| UC02 | Cadastrar produtor | RF03 · `TalhoesEProdutos.jsx`, `rotas/cadastro.js` |
| UC03 | Configurar produto | RF05 · `TalhoesEProdutos.jsx` |
| UC04 | Simular cotação | RF06 · `Cotacao.jsx`, `dominio/cotacao.js` |
| UC05 | Contratar apólice | RF07, RF08 · proposta em `Cotacao.jsx`, emissão em `Propostas.jsx`; a seguradora assina a implantação (DECISOES 1.20) |
| UC06 | Consultar apólice e linha do tempo | RF09 · `ApoliceDetalhe.jsx` |
| UC07 | Coletar dados de campo | RF11–RF13 · `simulador/`, `rotas/leituras.js`, `consolidador.js` |
| UC10 | Publicar dados via oráculo | RF19–RF22 · `oraculo/` |
| UC11 | Avaliar condição contratada | RF23 · `ApolicePolicy.sol` |
| UC12 | Executar pagamento | RF24–RF26 · `ApolicePolicy.sol` |
| UC13 | Notificar partes | RF27 · `indexador.js`, `notificacoes/email.js`, `Notificacoes.jsx` |
| UC15 | Gerar relatórios e indicadores | RF29 · `CarteiraDaSeguradora.jsx`, `rotas/acompanhamento.js` |

UC08 (Enviar imagens do talhão), UC09 (Analisar imagens) e UC14 (Contestar avaliação) deixaram
de existir junto com o módulo de visão computacional, o papel de perito e a contestação.

Os fluxos UC05, UC10, UC11 e UC12 possuem evidencia historica na Sepolia de 07/10, em outro protocolo. Nesta revisao, a validacao e local; o fluxo publico precisa ser repetido com os novos contratos.

---

## 5. Tecnologias (Quadro 20 da Entrega 3)

| Componente | Documento | Implementado |
|---|---|---|
| Contratos | Solidity + Hardhat | Solidity 0.8.24, Hardhat com rede local, testes e relatório de gas; sem dependências de contrato de terceiros (DECISOES 1.1) |
| Rede | Sepolia | Versão histórica verificada em 08/10; clima-integral-v1 aguarda nova implantação e verificação |
| Serviço de oráculo | Node.js + ethers.js | Node.js 24, ethers 6 |
| API e ingestão | Node.js + Express | Express 5 |
| Banco de dados | PostgreSQL + PostGIS | PostgreSQL com PostGIS: polígono do talhão, estações a até 100 km. Em desenvolvimento, o mesmo banco embutido (PGlite) |
| Simulador de sensores | Python + MQTT, séries do INMET | Python 3.12, paho-mqtt (com TLS), estações A770 e A747 do INMET |
| Interfaces | React + ethers.js | React 18, react-router 7, Vite 8, ethers 6 |
| Carteira do produtor | MetaMask | Provedor EIP-1193; o produtor da Sepolia foi criado na MetaMask |
| Serviço de notificação | Nodemailer | Nodemailer 10 (DECISOES 1.18) |

---

## 6. Ressalvas

Limitações e verificações pendentes da versão atual:

| Item | Situação |
|---|---|
| RNF08 na rede principal | Nova Sepolia ainda não medida. Cenário hipotético de 0,5 gwei: 25,33% do prêmio, acima da meta de 1%; alternativas exigem nova avaliação |
| RNF05 no Firefox | Verificado no Chrome e no Edge; o Firefox não estava instalado na máquina de medição. Conferir à mão com a MetaMask antes da apresentação |
| RNF01 com histórico longo | O nó público gratuito descarta blocos com alguns meses; uma vigência inteira pede nó com histórico completo (DECISOES 2.29) |
| Seca anterior à vigência | Conta no índice; correção possível documentada (DECISOES 1.21) |
