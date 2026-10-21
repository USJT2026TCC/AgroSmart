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

Em **Cadastros**, a seguradora segue produtor → propriedade/talhão e cultura → conferência. A área é digitada em hectares e identificada como informada, sem desenho no mapa. Produtos de seguro têm aba própria; consultas e edições ficam em **Consultar e editar**. O cadastro não exige transação na MetaMask.
