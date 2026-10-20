# Oraculo

## Demonstracao historica atual

1. Consulta apolices ativas no backend, apos deposito de garantia.
2. Para proposta historica, busca os dias originais de Sao Simao/A770 no banco.
3. Confere os termos de datas e gatilho com os gravados na apolice historica.
4. Avalia cronologicamente a cobertura com `src/historico.js`: comeca em zero,
   soma dias com chuva inferior a 1 mm e interrompe por chuva ou dado insuficiente.
5. Enfileira o primeiro periodo acionador. Se nao houver, enfileira o ultimo dia.
6. Assina a transacao com a chave do oraculo autorizado e relata o recibo ao backend.

Nao publica todos os dias em cadeia. O indice e calculado pelo oraculo, a partir
dos dias preparados; a consulta previa da aplicacao usa a mesma funcao pura.
A API recusa a serie se o conjunto de hashes diferir do fixado na proposta.
O banco e a importacao continuam fronteiras de confianca: hash nao prova a verdade
meteorologica. A fonte e unica, nao descentralizada; o servico tambem e de no unico.

`npm start` inicia o servico. O usuario nao precisa iniciar um comando por periodo.
A seguradora assina emissao e garantia; o produtor nao assina para receber.

## Falhas e compatibilidade

Fila em disco, reenvio com espera, controle de publicacao repetida e registro de
recibos permanecem ativos. Uma falha no relato nao desfaz pagamento confirmado.
Os registros ficam no diretorio privado da instancia, fora do Git.

O caminho anterior de leituras assinadas permanece para compatibilidade e testes;
usa `consolidador.js` e duas fontes. Ele nao e a regra da demonstracao historica,
que utiliza uma estacao e nunca desloca as datas.

Todos os testes estao em `testes/oraculo` e a integracao historica em
`testes/contratos/unitarios/FluxoHistorico.test.js`. Execute `npm test` na raiz.
