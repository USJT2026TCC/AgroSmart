# Escopo atual

Demonstracao historica de seguro por estiagem, uma estacao do INMET: Sao Simao/SP,
A770, de 2020 a setembro de 2026. Talhao ficticio considerado coincidente com a
estacao por hipotese. Medicoes reais; datas originais preservadas.

A cobertura e hipotetica. Inicio e fim sao inclusivos, em UTC. A contagem comeca
no inicio, sem herdar seca anterior. Dia utilizavel tem pelo menos 20 medicoes
horarias de chuva validas; soma abaixo de 1 mm conta como seco. Lacuna interrompe.
A proposta historica bloqueia janelas com dias incompletos. O gatilho e escolhido
na contratacao (1 a 366 dias), experimental, e nao pode mudar depois da emissao.

Ao primeiro acionamento, paga-se 100% do limite em parcela unica. Se nao houver
acionamento, o oraculo publica o ultimo dia e a seguradora pode resgatar a garantia.
O premio apresentado e informativo; nao e cobrado pelo contrato.

A data do bloco permanece atual. `ApoliceHistorica` identifica a demonstracao
explicitamente e verifica os periodos contra a cobertura historica. O contrato
aceita somente Sepolia e redes locais das suites. Cancelamento e permitido antes
da primeira publicacao historica; a garantia volta a seguradora. Apos a primeira
publicacao, o cancelamento e bloqueado. A publicacao pode liquidar na mesma transacao.

Nao ha visao computacional ativa, pericia por foto, estimativa de prejuizo da safra,
pagamento escalonado ou cobertura por excesso de chuva. Nao e seguro comercial
validado nem prova de adequacao agronomica ou atuarial do gatilho.

## Onde cada componente entra

| Componente | Responsabilidade |
|---|---|
| Python/etl | Reconstruir opcionalmente o pacote publico; registrar lacunas e origem |
| Backend e banco | Carga automatica do pacote no PostgreSQL Docker, consulta e propostas/eventos |
| Oraculo | Recalcular indice, selecionar primeiro acionamento e assinar publicacao |
| Contrato | Conferir autorizacao, datas e garantia; executar pagamento unico |
| Aplicativo | Definir cobertura/gatilho, consultar resultado e acompanhar transacoes |
| MetaMask | Assinar vinculo de carteira, emissao, garantia, cancelamento e resgate |

Consulte o manifesto publico em `blockchain/implantacoes/sepolia.json` para a versao
efetivamente implantada. Compilacao, teste local, codigo verificado e aceite com
MetaMask são verificações distintas.


## Implantação histórica

A fábrica `clima-integral-historico-v2` foi implantada e teve seu código verificado
na Sepolia em 21/10/2026. O manifesto compartilhado fica em
`blockchain/implantacoes/sepolia.json`. O registro de oráculos foi preservado.
O Compose de uso executa PostgreSQL, API/indexador, oráculo e interface; a blockchain
é externa e pública. Rede local e bancos descartáveis existem somente nas suítes.
Implantação verificada, teste de pagamento e aceite manual com MetaMask são verificações distintas.
