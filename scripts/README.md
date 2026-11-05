# Scripts de operação

| Arquivo                | Responsabilidade                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iniciar.mjs`          | Executa `npm start`, `npm stop` e `npm run status`; confere a Sepolia e configura API e oráculo no Docker; com `DOMINIO` em `blockchain/.env`, inclui o Caddy de `docker-compose.vm.yml` |
| `banco.mjs`            | Configura e inicia o único PostgreSQL operacional do Docker Compose                                                                                                                      |
| `processos.mjs`        | Executa comandos e localiza o Docker Desktop no Windows                                                                                                                                  |
| `servir-interface.mjs` | Serve a interface compilada e encaminha `/api` ao backend na rede Docker                                                                                                                 |
| `preparar-dados.mjs`   | Executa o ETL Python e o empacotador com `npm run dados:preparar`                                                                                                                        |
| `empacotar-dados.mjs`  | Confere período e SHA-256 dos CSVs antes de copiar o pacote para a API                                                                                                                   |
