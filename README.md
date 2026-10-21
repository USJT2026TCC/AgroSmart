# AgroSmart

Demonstração acadêmica de seguro por estiagem: dados reais do INMET A770
(São Simão/SP), de 01/01/2020 a 30/09/2026, e indenização integral em parcela única.
O talhão é fictício, considerado coincidente com a estação. O gatilho é
experimental e definido na contratação.

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

O produtor envia a proposta; a seguradora assina a emissão e deposita a garantia.
O oráculo avalia a série histórica e publica o índice. O contrato executa o pagamento
conforme os termos, e a interface apresenta a situação e as transações.

Detalhes: [arquitetura](docs/ARQUITETURA.md), [regras do seguro](docs/REGRAS.md)
e [dados do INMET](docs/DADOS.md).

## Blockchain e organização

Usamos **Sepolia, uma rede pública de testes**, com acesso às funções controlado
pelos contratos.
Referência: [redes Ethereum](https://ethereum.org/developers/docs/networks/).
Sepolia e MetaMask ficam fora do Docker; não há nó blockchain local no Compose de uso.

Fábrica histórica atual: [código verificado no Etherscan](https://sepolia.etherscan.io/address/0xae560FCc7f499b3844B7c419caD7A09e10e2872C#code).
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

O PostgreSQL/PostGIS é o banco de uso. Testes e evidências de execução
são mantidos apenas localmente e não acompanham este repositório. Os comandos
de teste nos pacotes exigem essa cópia local; não são necessários para executar
o sistema. O status dos serviços não comprova assinatura MetaMask nem pagamento.
