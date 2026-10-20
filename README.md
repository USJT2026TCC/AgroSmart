# AgroSmart

Demonstração acadêmica de seguro por estiagem com pagamento integral, uma única vez, em contrato inteligente. Talhão e produto cadastrados são exemplos pedagógicos. O limiar é experimental; não mede perda real de produção. Excesso de chuva não está implementado.

## Executar

Use Node.js 20.19+ ou 22.12+ e Docker Desktop instalado e aberto, com Compose v2 e contêineres Linux. Na raiz do repositório:

```powershell
npm ci
npm start
```

Abra **http://localhost:5173** no navegador com MetaMask na **Sepolia**. Usuários da demonstração: `produtor` e `seguradora`; senha: `agrosmart`.

`npm start` inicia interface, API, banco, indexador e oráculo na Sepolia. Não é necessário escolher outra rede de uso. O banco e a fila são preservados entre reinicializações.

Antes de iniciar, configure `RPC_SEPOLIA` e `CHAVE_PRIVADA_ORACULO` em `contratos/.env`. A chave deve corresponder ao oráculo autorizado na implantação de `contratos/implantacoes/sepolia.json`. Chaves e arquivos .env não são distribuídos pelo Git.

```powershell
npm run status
npm stop
```

O inicio sobe PostgreSQL/PostGIS no Docker, aguarda sua disponibilidade e aplica
as migracoes. A serie publica A770 ja acompanha o projeto em `backend/recursos/inmet`:
sete anos, de 2020 a 30/09/2026, com originais e hashes. A carga e automatica na primeira
execucao; nas seguintes, o volume `dados_pg` preserva o banco e anos identicos sao ignorados.
Nao precisa instalar Python nem baixar/processar os ZIPs do INMET para usar o aplicativo.

Se houver banco PGlite desta instancia, o inicio transfere seus dados somente para
um PostgreSQL vazio, preservando a origem e os vinculos de carteira. Recusa mesclar
com outro banco preenchido. Essa transferencia e local; usuarios e segredos nao sao
distribuidos no Git. `DATABASE_URL` explicita permite um PostgreSQL externo, sem
iniciar Docker nem transferir automaticamente dados locais para outro servidor.

`npm stop` encerra a aplicacao e deixa o banco disponivel. `npm run banco:parar`
interrompe o contêiner sem apagar o volume. Nao remova volumes se quiser preservar cadastros.
Se o Docker estiver ausente, o inicio avisa; nao troca silenciosamente para outro banco.

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

A verificacao real do PostgreSQL no Docker e separada: `npm run testar:docker`.
Ela usa um projeto e volume exclusivos de teste; nao altera o banco da aplicacao.
Requer Docker instalado e aberto. As suites comuns usam bancos isolados para suas verificacoes.

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
