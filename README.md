# AgroSmart

Demonstração acadêmica de seguro por estiagem com pagamento integral, uma única vez, em contrato inteligente. Talhão e produto cadastrados são exemplos pedagógicos. O limiar é experimental; não mede perda real de produção. Excesso de chuva não está implementado.

## Executar

Use Node.js 20.19+ ou 22.12+. Na raiz do repositório:

```powershell
npm ci
python -m venv simulador/.venv
.\simulador\.venv\Scripts\python.exe -m pip install -e "./simulador[dev]"
npm run dados:preparar
npm start
```

Abra **http://localhost:5173** no navegador com MetaMask na **Sepolia**. Usuários da demonstração: `produtor` e `seguradora`; senha: `agrosmart`.

`npm start` inicia interface, API, banco, indexador e oráculo na Sepolia. Não é necessário escolher outra rede de uso. O banco e a fila são preservados entre reinicializações.

Antes de iniciar, configure `RPC_SEPOLIA` e `CHAVE_PRIVADA_ORACULO` em `contratos/.env`. A chave deve corresponder ao oráculo autorizado na implantação de `contratos/implantacoes/sepolia.json`. Chaves e arquivos .env não são distribuídos pelo Git.

```powershell
npm run status
npm stop
```

`dados:preparar` e executado uma vez: baixa os arquivos anuais oficiais, prepara
Sao Simao/A770 de 2020 a 30/09/2026 e preserva os originais. A API importa os anos
novos no banco ao iniciar; o que ja foi importado nao e reprocessado. Depois,
para abrir o sistema basta `npm start`. [Detalhes](simulador/README.md).

## Fluxo

1. Produtor vincula sua carteira e marca **Usar dados historicos de Sao Simao** em Simular e contratar. Define inicio, fim e gatilho experimental (por exemplo, 10, 15 ou 30 dias). Pode analisar o periodo sem enviar transacao; depois envia a proposta.
2. Seguradora confirma na MetaMask a emissão e, em outra transação, o depósito da garantia.
3. O oraculo busca os dias ja importados, conta a estiagem desde o inicio da cobertura e publica o primeiro acionamento. Sem acionamento, publica o ultimo dia. Nao e necessario enviar novamente as leituras nem manter sensores ligados.
4. Ao atingir o gatilho durante a vigência, a apólice transfere 100% do limite ao produtor. O recebimento não exige assinatura. Confira Valor pago e a transação no detalhe da apólice.

MetaMask assina mensagens e transações e mostra a conta selecionada. Etherscan permite consultar publicamente contrato, eventos e recibos na Sepolia. Trocar o usuário do aplicativo não troca automaticamente a conta da extensão: cada papel deve usar sua própria conta autorizada.

O prêmio mostrado é informativo e não é cobrado pelo contrato. No modo historico, cancelar antes da primeira publicacao devolve a garantia a seguradora. Não há envio de fotos nem visão computacional. A demonstração com séries INMET reproduz dados históricos; não são sensores físicos nem medições ao vivo.

A cobertura e hipotetica, com talhao considerado coincidente com a estacao.
Datas meteorologicas permanecem originais; as transacoes e o ETH de teste sao da
Sepolia atual. A aplicacao bloqueia coberturas com dias incompletos. Dia utilizavel
significa pelo menos 20 horas validas, nao ausencia total de falhas horarias.

## Organização

| Pasta | Responsabilidade |
|---|---|
| contratos | Autorização, garantia e pagamento |
| oraculo | Consolidação e publicação do índice |
| backend | API, validação e acesso ao banco |
| app | Interface web |
| simulador | Preparacao unica dos dados historicos INMET |
| testes | Todas as suítes, fixtures, configurações, medições e evidências |
| docs | Documentação de software e referências técnicas |

## Verificações

```powershell
npm test
```

Tudo que serve a testes está em [testes](testes). As redes locais são iniciadas somente pelas suítes automatizadas. Exige Slither no PATH e o ambiente Python `simulador/.venv` com as dependências dev. Os resultados gerados ficam em `testes/gerados`, fora do Git.

A configuração entregue não inclui chaves de terceiros. Um professor que queira assinar como seguradora ou operar um novo oráculo precisa de contas próprias e de uma implantação autorizada para essas contas; consultar os contratos públicos não requer essas chaves.


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
