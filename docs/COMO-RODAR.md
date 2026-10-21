# Executar o AgroSmart

O caminho de uso e apenas Sepolia. Siga o [README da raiz](../README.md).

1. Instale as dependencias na raiz: `npm ci`.
2. Configure blockchain/.env com o RPC e a chave do oraculo correspondente a implantacao. Nunca envie chaves ao Git.
3. Execute `npm start` e abra http://localhost:5173 no navegador com MetaMask.
4. Use `npm run status` para conferir os servicos e `npm stop` para encerra-los.

Os testes ficam exclusivamente em [testes](../testes). Use `npm test`. A blockchain local e uma infraestrutura de testes, nao uma alternativa de uso do aplicativo.
