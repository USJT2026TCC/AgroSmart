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
| Python/simulador | Baixar e preparar uma vez; registrar lacunas e origem |
| Backend e banco | Importar uma vez por versao, consultar dados e guardar propostas/eventos |
| Oraculo | Recalcular indice, selecionar primeiro acionamento e assinar publicacao |
| Contrato | Conferir autorizacao, datas e garantia; executar pagamento unico |
| Aplicativo | Definir cobertura/gatilho, consultar resultado e acompanhar transacoes |
| MetaMask | Assinar vinculo de carteira, emissao, garantia, cancelamento e resgate |

Consulte o manifesto publico em `contratos/implantacoes/sepolia.json` para a versao
efetivamente implantada. Compilacao, teste local, codigo verificado e aceite com
MetaMask sao verificacoes distintas. Resultados de versoes anteriores ficam em
`testes/evidencias` e nao comprovam o funcionamento desta revisao.


## Estado da implantacao historica

O processamento e a consulta historica estao implementados e os sete anos foram
importados no banco local. A fabrica publica no manifesto ainda usa
`clima-integral-v1`: ela nao emite `ApoliceHistorica`. A API bloqueia essa emissao
com uma mensagem explicita, em vez de enviar uma transacao incompativel.
A publicacao da nova fabrica requer aprovacao especifica e ainda nao ocorreu.
`contratos/scripts/atualizar-fabrica.js` prepara essa atualizacao preservando o
OracleRegistry e a instancia de banco atual; nao foi executado na Sepolia.
Depois da implantacao, e necessario verificar seu codigo e reiniciar o sistema.
Uma consulta historica bem-sucedida nao significa indenizacao paga na rede publica.
