# AgroSmart

Protótipo acadêmico de seguro por estiagem, com indenização integral em parcela única. Não há processamento de fotos nem pagamento escalonado. O gatilho é experimental, não uma tolerância agronômica validada.

## Abrir o software

Use esta pasta: `C:\TCC 2026 - SemVisaoComputacional`.
Pré-requisito: Node.js 20 ou superior e dependências dos quatro módulos instaladas.

```powershell
npm run instalar
npm start
```

Abra **http://localhost:5173** no navegador com MetaMask. Mantenha o terminal aberto. `npm stop` ou Ctrl+C encerra os serviços iniciados. Não inicie outra instância nas mesmas portas.

`npm start` liga blockchain local, implanta os contratos atuais, inicia API, banco separado, indexador, interface e oráculo. Reutiliza uma rede local 31337 existente. Na demonstração local, cada execução cria um banco novo e preserva os anteriores. Na Sepolia, o banco e a fila são mantidos por implantação, preservando vínculos e propostas entre reinicializações. As contas dessa rede são públicas de desenvolvimento e nunca devem receber dinheiro real.

```powershell
npm run status
```

Confere API, código da fábrica, indexador, interface e processo do oráculo. Não valida a extensão MetaMask nem substitui a conferência de uma transação.

## Usar o fluxo

1. Entre como `produtor`, senha local `agrosmart`. Confira a carteira beneficiária em Minha carteira; o banco local vem com a conta 1 de desenvolvimento. Para usar outra carteira, conecte-a e assine o vínculo.
2. Faça uma cotação e envie a proposta. Isso não transfere ETH.
3. Entre como `seguradora`, mesma senha local. Na MetaMask, use a conta 0 da rede local. Em Propostas, confirme a emissão e depois o depósito da garantia: são duas transações.
4. Para experimentar estiagem SINTÉTICA, execute em outro terminal na raiz: `npm run leituras:demo`. O oráculo busca as leituras na API e publica automaticamente. Não são sensores físicos nem INMET ao vivo.
5. Abra a apólice. Confira índice, situação, Valor pago e transação. Ao atingir o gatilho durante a vigência, o contrato paga 100% do limite. O produtor não assina para receber. Confira também o saldo da conta beneficiária na mesma rede.

O prêmio mostrado na cotação não é cobrado pelo contrato. Excesso de chuva não está coberto. Cancelamento só é possível antes do início da vigência e devolve a garantia à seguradora.

## Sepolia

Há uma implantação atual em `contratos/implantacoes/sepolia.json`. Para iniciar todos os serviços nessa rede, encerre a execução local e use:

```powershell
npm run start:sepolia
```

Exige `RPC_SEPOLIA` e `CHAVE_PRIVADA_ORACULO` em `contratos/.env`, correspondentes à implantação. A seguradora assina emissão e garantia na MetaMask; o iniciador não recebe nem guarda a chave do produtor. O produtor deve vincular a própria carteira por assinatura. O envio sintético rápido é bloqueado nesse modo. Use somente ETH de teste.

MetaMask é uma extensão do seu navegador. Não faz parte do servidor e não é instalada nem desbloqueada por esses comandos. A interface informa quando não encontra carteira ou quando a rede/conta está incorreta. Carteira simulada não deve ser usada na apresentação.

## Uma entrada para as verificações

```powershell
npm test
```

Executa sequencialmente: contratos e cobertura, Slither, API e cobertura, integrações locais, oráculo e cobertura, telas e cobertura, build e simulador. Exige Slither no PATH e `simulador/.venv` com dependências de desenvolvimento. Interrompe na primeira falha. Os arquivos de teste ficam junto dos respectivos módulos; a execução é centralizada aqui.

## Organização

| Pasta     | Função                                      |
| --------- | ------------------------------------------- |
| app       | Interface web                               |
| backend   | API e acesso ao banco                       |
| oraculo   | Cálculo e publicação do índice              |
| contratos | Garantia e pagamento na blockchain          |
| simulador | Envio de leituras assinadas                 |
| scripts   | Iniciar e verificar o conjunto              |
| docs      | Referência técnica e documentação acadêmica |

Para operar, siga apenas este README. Documentos e medições anteriores em docs são referência histórica e devem ser conferidos pela versão de contrato. O artigo ainda precisa ser alinhado: esta versão não grava hash do conjunto de leituras na blockchain.
