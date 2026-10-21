# AgroSmart

Demonstração acadêmica de seguro por estiagem: dados reais do INMET A770
(São Simão/SP), de 01/01/2020 a 30/09/2026, e indenização integral em parcela única.
O talhão é fictício, considerado coincidente com a estação. O gatilho é
experimental: não estima prejuízo agrícola. Sem visão computacional ou excesso de chuva.

## Executar

Requisitos: Node.js 22.12+ ou 24, Docker Desktop com Compose 2.24+ e contêineres
Linux, internet e MetaMask no navegador com Sepolia selecionada.
Configure `RPC_SEPOLIA` e `CHAVE_PRIVADA_ORACULO` em `blockchain/.env`.
A chave deve corresponder ao oráculo autorizado no manifesto público.
Não envie chaves privadas nem arquivos `.env` ao Git.

```powershell
npm ci
npm start
```

Abra **http://localhost:5173**. API: **http://localhost:3001/api**.
Login de demonstração: `produtor` ou `seguradora`; senha inicial `agrosmart`.
Login na API e conta da MetaMask são independentes. Cada papel deve usar sua conta.

O Compose executa **banco, API/indexador, oráculo e interface**. O primeiro início
baixa imagens e dependências; os seguintes reutilizam o cache. O pacote climático
já acompanha o Git: a API importa os sete anos automaticamente, sem duplicação.
O volume `dados_pg` preserva o banco desta instalação. Outra pessoa recebe o mesmo
pacote público, não seus cadastros ou chaves. Python é necessário somente para
reconstruir os dados e para os testes do ETL.

| Comando | Ação |
|---|---|
| `npm run status` | Mostra serviços e confere API, interface e fábrica |
| `npm stop` | Para os quatro serviços, preservando dados |
| `docker compose logs --tail 50 oraculo` | Mostra os ciclos e eventuais falhas do oráculo |
| `npm run dados:preparar` | Reconstrói o pacote INMET; veja [ETL](etl/README.md) |

## Fluxo

![Fluxo histórico](docs/imagens/fluxo-dados.svg)

O produtor vincula a carteira, escolhe cobertura histórica e gatilho (1 a 366 dias)
e envia a proposta. A contagem começa no início da cobertura. Dia seco: chuva
diária abaixo de 1 mm, com pelo menos 20 horas válidas; lacunas não viram zero.
A proposta recusa coberturas com dias incompletos.

A seguradora assina a emissão e deposita a garantia pela MetaMask. O oráculo
consulta a API, confere a série e os termos, calcula o índice e assina a publicação.
O contrato paga uma vez, ao atingir o gatilho. O produtor não precisa assinar para
receber. O prêmio exibido é informativo e não é cobrado pelo contrato.
Cancelamento histórico: permitido antes da primeira publicação, com devolução da
garantia à seguradora. Sem acionamento, a publicação final permite resgatar a garantia.

A interface mostra a situação da apólice e os links das transações. O saldo recebido
pode ser conferido na conta beneficiária da MetaMask e no explorador.
As datas climáticas permanecem históricas; blocos e transferências têm a data atual.

## Blockchain e organização

Usamos **Sepolia, uma rede pública de testes**, com acesso às funções controlado
pelos contratos. Isso não é blockchain privada. Uma rede privada exigiria operar
os próprios nós e validadores; não é necessária para este recorte acadêmico.
Referência: [redes Ethereum](https://ethereum.org/developers/docs/networks/).
Sepolia e MetaMask ficam fora do Docker; não há nó blockchain local no Compose de uso.

Fábrica histórica atual: [código verificado no Etherscan](https://sepolia.etherscan.io/address/0x5925b55553C3c3c5A4A94CC48563B4403Ab649D1#code).
API, oráculo e interface usam o mesmo manifesto em `blockchain/implantacoes/sepolia.json`.

| Pasta | Responsabilidade |
|---|---|
| `etl/` | Extração, validação e consolidação do INMET |
| `api/` | Autenticação, cadastros, PostgreSQL e indexação da blockchain |
| `oraculo/` | Conferência, cálculo e publicação do índice |
| `blockchain/` | Contratos e implantação na Sepolia |
| `interface/` | Aplicação web |
| `configuracao/` | Recorte climático compartilhado |
| `scripts/` | Inicialização Docker e preparo do pacote |
| `docs/` | Explicações técnicas |

Há um único PostgreSQL de uso, sem PGlite. Testes e evidências de execução
são mantidos apenas localmente e não acompanham este repositório. Os comandos
de teste nos pacotes exigem essa cópia local; não são necessários para executar
o sistema. O status dos serviços não comprova assinatura MetaMask nem pagamento.
