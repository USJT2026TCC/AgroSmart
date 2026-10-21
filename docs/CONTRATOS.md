# Contratos e demonstracao historica

`ApoliceFactory.emitirApoliceHistorica` emite `ApoliceHistorica` com a mesma garantia
integral de `ApolicePolicy`. Os termos de cobertura referem-se as datas INMET;
o timestamp do bloco registra quando a demonstracao ocorreu na Sepolia.
Somente o oraculo autorizado publica. Periodos devem estar na cobertura e seguir
ordem crescente, com indice que nao exceda os dias desde o inicio. A verdade do
indice continua dependendo do oraculo, que percorre os dados originais.

O relogio historico inicia antes da cobertura, permitindo cancelamento ate a
primeira publicacao. Ao publicar o ultimo dia sem acionamento, permite resgate
da garantia. Uma liquidacao paga integralmente e bloqueia novas publicacoes.
Datas invalidas, publicacao repetida, origem nao autorizada e falta de garantia
sao rejeitadas. As protecoes de reentrancia e atomicidade permanecem.

A fabrica tambem preserva emissao convencional para compatibilidade; a aplicacao
identifica explicitamente o modo historico. Os contratos anteriores sao imutaveis
e nao ganham esse comportamento: e necessaria nova fabrica implantada.

Consulte `blockchain/implantacoes/sepolia.json` para enderecos e versao atuais.
Todos os testes, configuracao de cobertura e Slither ficam em `testes/`.
Execute `npm test` na raiz. Testes locais nao substituem o aceite com MetaMask.

O contrato historico agora exige cobertura entre 01/01/2020 e 30/09/2026 (UTC) e
gatilho de 1 a 366 dias. Os limites correspondem a configuracao/historico.json.
