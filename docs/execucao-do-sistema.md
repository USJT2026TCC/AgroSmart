# Execução do sistema

Resumo dos passos para executar o AgroSmart, com o passo a passo completo em
`scripts/README.md`.

## Requisitos

A máquina precisa do Node.js 22.12 ou superior e do Docker com o Docker Compose. O
navegador precisa da extensão MetaMask, com a rede Sepolia ativada. As contas do oráculo
e da seguradora precisam de ETH de teste da Sepolia, obtido gratuitamente em uma faucet.
Use somente contas criadas para testes, sem valor real.

## Configuração

As variáveis ficam no arquivo `blockchain/.env`, criado a partir de
`blockchain/.env.example`. Esse arquivo guarda chaves privadas e não vai para o Git.

| Variável | Uso |
|---|---|
| `RPC_SEPOLIA` | Endereço de acesso à Sepolia, obtido em um provedor como Infura ou Alchemy |
| `CHAVE_PRIVADA_ORACULO` | Chave da conta que publica os índices; com os contratos em uso, é a conta do oráculo autorizado, entregue pela equipe |
| `CHAVE_PRIVADA_SEGURADORA` | Usada só para publicar contratos próprios; a conta passa a ser a seguradora desses contratos |
| `ETHERSCAN_API_KEY` | Usada só para verificar contratos próprios no explorador de blocos |
| `PRECO_GAS_GWEI` | Opcional; fixa o preço do gás nas transações |
| `DOMINIO` | Só na máquina virtual; endereço público que ativa o Caddy com HTTPS |

## Início e comandos

Na pasta do projeto:

```powershell
npm ci
npm start
```

O `npm ci` instala as dependências, e o `npm start` confere a Sepolia, configura a API e
o oráculo e inicia os serviços no Docker. O primeiro início baixa as imagens e importa a
série do INMET, o que leva alguns minutos. Depois, a interface abre em
http://localhost:5173, com os perfis de demonstração `produtor` e `seguradora`, ambos
com a senha `agrosmart`. Seguradora e produtor precisam de contas diferentes na MetaMask.

| Comando | Efeito |
|---|---|
| `npm run status` | Mostra se os serviços estão em execução |
| `npm stop` | Para os serviços e preserva os dados |
| `docker compose logs --tail 50 oraculo` | Mostra as últimas mensagens do serviço de oráculo |
| `npm test` | Executa os testes automatizados |
| `npm run dados:preparar` | Refaz o pacote de dados do INMET; o pacote já acompanha o projeto |

Ao iniciar, o oráculo pode processar apólices ativas e enviar transações e pagamentos na
Sepolia automaticamente.

## Contratos próprios

Os contratos em uso pertencem às contas da equipe. Para executar com outras contas:

```powershell
$env:NOVA_IMPLANTACAO=1; npm run implantar:sepolia --workspace blockchain
npm start
```

O primeiro comando publica o registro de oráculos, autoriza o oráculo, publica a fábrica
e grava os endereços em `blockchain/implantacoes/sepolia.json`. O `npm start` inicia o
sistema com os novos contratos.

## Máquina virtual

Para hospedar o sistema, a equipe usa uma máquina virtual do Google Cloud do tipo
e2-medium, com Ubuntu 24.04, endereço IP fixo e tráfego HTTP e HTTPS liberado. Na
máquina, a equipe instala o Docker, o Node.js e o Git, clona o repositório e envia o
arquivo `.env` diretamente, sem passar pelo Git. Com a variável `DOMINIO` preenchida com
o IP no formato do serviço sslip.io, o `npm start` também inicia o Caddy, que obtém o
certificado HTTPS.
