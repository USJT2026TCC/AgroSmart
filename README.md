# AgroSmart

Demonstração acadêmica de seguro por estiagem com pagamento integral, uma única vez, em contrato inteligente. Talhão e produto cadastrados são exemplos pedagógicos. O limiar é experimental; não mede perda real de produção. Excesso de chuva não está implementado.

## Executar

Use Node.js 20.19+ ou 22.12+. Na raiz do repositório:

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

## Fluxo

1. Produtor vincula sua carteira por assinatura, sem transferir ETH; depois cota e envia a proposta.
2. Seguradora confirma na MetaMask a emissão e, em outra transação, o depósito da garantia.
3. Fontes enviam leituras assinadas à API. O oráculo calcula a sequência de dias secos e publica o índice. Abrir a tela não gera leituras.
4. Ao atingir o gatilho durante a vigência, a apólice transfere 100% do limite ao produtor. O recebimento não exige assinatura. Confira Valor pago e a transação no detalhe da apólice.

MetaMask assina mensagens e transações e mostra a conta selecionada. Etherscan permite consultar publicamente contrato, eventos e recibos na Sepolia. Trocar o usuário do aplicativo não troca automaticamente a conta da extensão: cada papel deve usar sua própria conta autorizada.

O prêmio mostrado é informativo e não é cobrado pelo contrato. Cancelar antes da vigência devolve a garantia à seguradora. Não há envio de fotos nem visão computacional. A demonstração com séries INMET reproduz dados históricos; não são sensores físicos nem medições ao vivo.

## Organização

| Pasta | Responsabilidade |
|---|---|
| contratos | Autorização, garantia e pagamento |
| oraculo | Consolidação e publicação do índice |
| backend | API, validação e acesso ao banco |
| app | Interface web |
| simulador | Envio de leituras históricas assinadas |
| testes | Todas as suítes, fixtures, configurações, medições e evidências |
| docs | Documentação de software e referências técnicas |

## Verificações

```powershell
npm test
```

Tudo que serve a testes está em [testes](testes). As redes locais são iniciadas somente pelas suítes automatizadas. Exige Slither no PATH e o ambiente Python `simulador/.venv` com as dependências dev. Os resultados gerados ficam em `testes/gerados`, fora do Git.

A configuração entregue não inclui chaves de terceiros. Um professor que queira assinar como seguradora ou operar um novo oráculo precisa de contas próprias e de uma implantação autorizada para essas contas; consultar os contratos públicos não requer essas chaves.
