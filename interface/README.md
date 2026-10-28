# Interface

Aplicação web em React usada pela seguradora e pelo produtor. Roda no Docker pelo
`npm start` da raiz e abre em http://localhost:5173. Usa a MetaMask para assinar.

## Telas

| Perfil | Tela | O que faz |
|---|---|---|
| Seguradora | Painel | Apólices, indicadores, saldo da seguradora, situação do oráculo e endereços dos contratos |
| Seguradora | Propostas | Aprova a proposta (cria a apólice na MetaMask), deposita a garantia ou recusa |
| Seguradora | Talhões | Cadastra e remove talhões do João |
| Produtor | Meus talhões e seguros | Talhões, propostas e apólices; pede proposta para um talhão livre |
| Produtor | Simular e contratar | Escolhe período e gatilho, vê a cotação e envia a proposta |
| Produtor | Minha carteira | Vincula a conta MetaMask que vai receber a indenização |
| Ambos | Detalhe da apólice | Termos, publicações do oráculo e histórico de transações |

As telas de acompanhamento se atualizam sozinhas a cada 20 segundos. O botão ⓘ do
topo mostra o passo a passo de cada perfil.

## Organização de `src/`

| Pasta | Conteúdo |
|---|---|
| `paginas/` | Telas do produtor, da seguradora e comuns |
| `componentes/` | Cabeçalho, ajuda, cartões e elementos reutilizados |
| `cadeia/` | MetaMask, chamadas aos contratos e formatação de valores |
| `api/` | Chamadas à API e atualização automática |
| `sessao/` | Login e perfis |

Antes do build, `scripts/sincronizar-enderecos.mjs` copia os endereços dos contratos
de `blockchain/implantacoes/sepolia.json`.
