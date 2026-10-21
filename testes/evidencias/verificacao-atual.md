# Verificação atual — 21/10/2026

## Execução e estrutura

Pastas: `api`, `blockchain`, `interface`, `etl`, `oraculo` e `testes`.
Uso: quatro serviços Docker (banco, API/indexador, oráculo e interface), um único
PostgreSQL/PostGIS persistente e Sepolia externa. Não há PGlite nem nó local de uso.
Os testes criam bancos descartáveis e EVMs isoladas.

## Comandos e resultados

`npm test` concluiu as oito etapas, incluindo quatro novos testes HTTP do servidor
da interface. Saída: `testes/gerados/verificacao-integracao-docker.txt`.
Após remover o helper não usado de vigência atual, `npm run cobertura --workspace
agrosmart-oraculo` confirmou novamente o oráculo; saída `testes/gerados/oraculo-final.txt`.

| Verificação | Resultado |
|---|---|
| Infraestrutura | 5 testes |
| Contratos, incluindo fluxo PostgreSQL/API/oráculo/EVM | 96 testes |
| Slither | 4 contratos, 102 detectores, zero achados |
| API | 85 testes; 76% das linhas |
| Indexador real contra EVM local | 5 testes de integração |
| Oráculo | 59 unitários + 4 integrações; 90,92% das linhas |
| Interface | 60 testes; 81,64% das linhas; build aprovado |
| Servidor HTTP/proxy da interface | 4 testes |
| ETL | 14 testes; 89,30% de cobertura |
| Contratos: cobertura | 100% das linhas; 91,1% das ramificações |
| `npm run testar:docker` | 1 teste com volume separado: carga, reinício e idempotência |

Um ensaio de parada do Docker coincidiu com uma execução da suíte do indexador.
Essa execução interrompida foi descartada; a suíte passou isoladamente e a
verificação completa foi repetida com o banco estável.

## Docker em uso

`npm start`, `npm run status`, `npm stop` e novo `npm start` foram executados.
API e interface responderam; indexador ativo sem erro e oráculo iniciado.
Antes e depois do reinício: 2 usuários, 1 carteira vinculada, 2.465 dias INMET,
zero apólices. Datas: 01/01/2020 a 30/09/2026. O volume foi preservado.
Na rota real de apólices ativas, sem chave de serviço: HTTP 401; com a chave:
HTTP 200, zero apólices ativas. A imagem foi inspecionada: sem `.env`, chaves,
segredos de execução, suíte de testes ou ETL.

## Sepolia

- Fábrica: `0x5925b55553C3c3c5A4A94CC48563B4403Ab649D1`.
- Registro e contas autorizadas preservados e conferidos por RPC.
- [Transação de implantação](https://sepolia.etherscan.io/tx/0x686629181a67e3a9cd9748b999182b4970cef1aadc7c8d03d2edbddba2ea108a).
- Bloco: 11963588; instante UTC: 2026-10-21T16:25:24.000Z; recibo: sucesso.
- Gas: 26098734; custo: 0.00026098734 ETH de teste.
- [Código-fonte verificado](https://sepolia.etherscan.io/address/0x5925b55553C3c3c5A4A94CC48563B4403Ab649D1#code).
- API, imagem da interface e oráculo usam o manifesto público atual.

## Limites

Não foi emitida apólice pública nesta revisão: não há teste de pagamento desta
fábrica na Sepolia nem aceite manual de emissão/garantia com MetaMask.
Os testes de transferência foram executados na EVM local. A próxima verificação
de aceite deve contratar uma cobertura válida na interface, emitir e garantir
com a carteira da seguradora e conferir o recibo e saldo do beneficiário.
Cobertura de testes e ausência de achados do Slither não provam ausência de falhas.
