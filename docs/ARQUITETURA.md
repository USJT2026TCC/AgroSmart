# Arquitetura

O AgroSmart executa uma demonstração de seguro por estiagem com dados históricos.
A aplicação usa a Sepolia, rede pública de testes, e quatro serviços Docker:

| Serviço | Responsabilidade |
|---|---|
| `interface` | Telas do produtor e da seguradora; interação com a MetaMask |
| `api` | Autenticação, cadastros, propostas, consultas e indexação da blockchain |
| `banco` | PostgreSQL/PostGIS com dados climáticos, termos e registros da aplicação |
| `oraculo` | Conferência da série, cálculo da estiagem e publicação do índice |

## Fluxo

![Fluxo do AgroSmart](imagens/fluxo-dados.svg)

1. A API importa o pacote INMET no banco durante a inicialização.
2. O produtor escolhe cobertura e gatilho; a API valida os dados e registra a proposta.
3. A seguradora assina a emissão e o depósito da garantia pela MetaMask.
4. O oráculo consulta a API autenticada, confere os termos com a apólice e os dados
   com o pacote público, calcula o índice e envia a publicação à Sepolia.
5. O contrato verifica as condições e executa a indenização quando o gatilho é atingido.
6. O indexador registra os eventos; a interface apresenta o estado e as transações.

O ETL é uma ferramenta de preparação, executada quando o pacote climático precisa
ser reconstruído. A execução usa o pacote que acompanha o repositório.

## Persistência e acesso

O volume `dados_pg` preserva o banco da instalação. A fila do oráculo e os segredos
ficam em `.execucao/`, fora do Git. A MetaMask guarda as contas dos usuários no
navegador; a chave de publicação é fornecida somente ao serviço do oráculo.
Os componentes compartilham o manifesto `blockchain/implantacoes/sepolia.json`.

Execução: [README principal](../README.md). Regras: [seguro](REGRAS.md).
Procedência e qualidade: [dados](DADOS.md).
