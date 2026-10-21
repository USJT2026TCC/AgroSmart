# Aplicativo

Interface React/Vite do produtor e da seguradora, integrada a API e a Sepolia.

Execute `npm start` na raiz, com Docker Desktop aberto e configuracao Sepolia pronta.
Abra http://localhost:5173 com MetaMask. Login: produtor ou seguradora; senha inicial
agrosmart. A conta da MetaMask e independente do login da API.

O produtor vincula sua carteira, escolhe periodo historico e gatilho experimental,
envia proposta e acompanha a apolice. A seguradora prepara a emissao e assina
emissao e garantia. A indenizacao e executada pelo contrato, sem nova assinatura
do produtor para recebe-la. A fábrica histórica pública está implantada e verificada.

A fonte e unica, INMET A770, de 01/01/2020 a 30/09/2026. Os campos usam os limites de
configuracao/historico.json. Nao ha medicao atual, carteira simulada por URL ou login
provisorio por localStorage. Consultar um periodo nao envia transacao.

| Pasta em src/ | Funcao |
|---|---|
| api/ | Requisicoes ao backend |
| sessao/ | Sessao autenticada e perfis |
| cadeia/ | MetaMask, contratos, eventos e enderecos |
| paginas/ | Telas do produtor e da seguradora |
| componentes/ | Elementos compartilhados da interface |

Dentro de interface/: `npm run testar` verifica telas e `npm run build` gera o pacote.
Testes e carteira falsa existem somente em testes/. Detalhes: docs/APLICATIVO.md.
