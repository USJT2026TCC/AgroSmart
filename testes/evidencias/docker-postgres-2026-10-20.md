# PostgreSQL/PostGIS no Docker — 20/10/2026

O uso normal passou a exigir PostgreSQL/PostGIS. A execucao direta sem DATABASE_URL
falha explicitamente; nao recria PGlite persistente. O iniciador reconhece Docker
Desktop por usuario no Windows e acrescenta seus auxiliares ao PATH dos filhos.

## Verificacoes executadas

- 111 testes unitarios da API passaram. Apos ajustar a copia temporal, os dois
  testes de transferencia/importacao foram repetidos e passaram.
- 5 testes de infraestrutura passaram, incluindo recusa de banco persistente alternativo.
- 1 integracao com PostgreSQL/PostGIS real passou: identidades, senhas protegidas,
  geometrias, precisao de microssegundos, importacao de 7 anos/2.465 dias,
  reabertura da conexao e repeticao sem duplicacao. Usa projeto/volume temporarios.
- A primeira tentativa da integracao excedeu 240 s durante o download inicial da imagem.
  O limite foi ampliado para incluir esse preparo; a execucao com cache passou.
- Configuracao Compose e sintaxe dos arquivos alterados verificadas.

A transferencia desta instalacao foi conferida nas 20 tabelas de aplicacao:
comparacao de todos os registros em JSON canonico, com sessoes SQL em UTC,
independente de ordem de colunas, objetos JSON e fuso de exibicao.
Carteira vinculada e hashes de senha preservados; nenhum conteudo pessoal e publicado.
A leitura de campos temporais na transferencia usa texto SQL, evitando limitar
sua precisao ao Date do JavaScript.

Apos a conferencia, os cinco diretorios PGlite antigos de backend/dados foram
removidos com autorizacao do usuario. Nenhum volume PostgreSQL de uso foi apagado.
O sistema e o conteiner foram parados e iniciados novamente. Resultado:

| Item | Depois do reinicio |
|---|---:|
| Usuarios | 2 |
| Carteiras vinculadas | 1 |
| Propostas | 4 |
| Dias INMET | 2.465 |
| Anos/dias reimportados | 0 / 0 |
| Bancos PGlite persistentes recriados | 0 |

Status operacional: interface HTTP respondeu, API informou motor postgres,
Sepolia retornou chainId 11155111, fabrica possui codigo, indexador ativo e
processo do oraculo ativo. Isso nao valida MetaMask, assinatura humana,
emissao historica ou pagamento publico desta revisao. Nao houve implantacao
nova nem transacao publica durante esta integracao.
