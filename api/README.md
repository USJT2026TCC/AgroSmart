# API

Backend em Node.js (Express) com PostgreSQL. Roda no Docker pelo `npm start` da raiz,
na porta 3001. A interface conversa com ele em `/api`; para conferir se está no ar,
abra http://localhost:3001/api/saude.

## O que faz

- Login dos dois perfis fixos e controle do que cada um pode acessar.
- Vínculo da carteira MetaMask do produtor por assinatura (sem custo de gás).
- Cadastro e remoção de talhões do produtor; cultura e município são fixos.
- Importa a série do INMET no banco e avalia períodos para a cotação.
- Registra propostas e prepara os termos que a seguradora assina na MetaMask.
- Confere na blockchain se a apólice criada tem exatamente os termos da proposta.
- Acompanha os eventos dos contratos (garantia, publicações, pagamentos) e gera os
  avisos que aparecem na tela "Avisos" de cada perfil. O cancelamento ocorre
  antes da primeira publicação histórica; a garantia é devolvida à seguradora.
- Entrega ao oráculo as apólices ativas vinculadas a propostas históricas emitidas
  e a série de cada uma, com uma chave de serviço.

A API não guarda chaves privadas, não assina transações e não paga indenizações.

## Organização

| Pasta | Conteúdo |
|---|---|
| `recursos/inmet/A770/` | Arquivos oficiais e chuva diária consolidada da estação A770 (2020 a setembro de 2026), com hash de cada arquivo; a API carrega no banco ao iniciar |
| `src/rotas/` | Rotas HTTP: autenticação, carteira, cadastro, propostas, apólices, oráculo e acompanhamento |
| `src/dominio/` | Regras: termos e seu hash, cotação histórica, conferência da emissão |
| `src/cadeia/` | Leitura dos contratos e indexador de eventos |
| `src/banco/` | Conexão, esquema (`esquema.sql`), importação do INMET e dados iniciais |
| `src/seguranca/` | Senhas (bcrypt) e sessões |

O banco começa com o produtor João, a seguradora Marina, a Fazenda Santa Clara com
dois talhões de soja e o produto "Estiagem — soja" (0,006 ETH, gatilho sugerido de 30 dias).
O `npm start` da raiz fornece a configuração dos serviços. A cultura é soja, o
município é São Simão/SP e o período disponível vai de 01/01/2020 a 30/09/2026.
A duração da cobertura vem das datas escolhidas pelo produtor, não do produto.

## Integração

Interface → API → PostgreSQL para cadastros, consultas e propostas.
Oráculo → API autenticada para obter a série e relatar publicações ou falhas.
Sepolia → indexador da API → PostgreSQL → interface para acompanhar a apólice.

A consulta histórica usa a função de avaliação de `oraculo/src/historico.js`.
Ela apenas apresenta a simulação; a publicação que pode acionar o pagamento é
feita pelo serviço do oráculo e validada pelo contrato na Sepolia.

Relatos repetidos da mesma publicação não criam duplicatas e preservam os dados
já registrados. A mesma transação com apólice, período ou índice divergente é
recusada. A confirmação do relato depende do evento encontrado pelo indexador.
