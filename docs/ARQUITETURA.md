# Arquitetura atual

Seguro academico de estiagem com dados historicos reais e indenizacao integral,
uma unica vez. Fonte: Sao Simao/SP, A770, 2020 a setembro/2026. Talhao ficticio.
As regras e limitacoes estao em [escopo atual](ESCOPO-ATUAL.md).

## Preparacao opcional

INMET â†’ ETL Python â†’ pacote publico com originais, diarios e manifesto â†’ backend
importa no PostgreSQL/PostGIS. O ETL nao envia leituras de sensores, nao desloca
datas e nao publica transacoes. `npm run dados:preparar` prepara e empacota;
`npm start` faz a carga inicial, sem repetir anos com hashes identicos.

## Contratacao e avaliacao

1. A interface consulta a API, escolhe cobertura historica e gatilho experimental.
2. O backend valida a janela, calcula os termos e congela o hash da serie na proposta.
3. A emissao e o deposito da garantia acontecem na blockchain, com assinatura de carteira.
4. O oraculo consulta a API autenticada `/oraculo/serie-historica`, que le `inmet_dias`.
5. A API confere o hash da serie. O oraculo confere datas e gatilho contra a cadeia,
   recalcula dias secos desde o inicio e primeiro acionamento;
   grava a publicacao em fila persistente, assina e envia ao contrato.
6. O contrato verifica autorizacao, periodo e condicao contratada e pode pagar
   100% do limite na mesma transacao. Nao acessa INMET, API ou banco diretamente.
7. O indexador acompanha eventos e recibos; a interface mostra o resultado pela API
   e pelas consultas a cadeia. Relato do oraculo nao substitui confirmacao on-chain.

O contrato historico diferencia a cobertura hipotetica das datas atuais dos blocos.
É uma demonstração histórica, sem contratação retroativa comercial. A fábrica
histórica está implantada e verificada na Sepolia; veja o manifesto compartilhado.

## Responsabilidades

| Componente | Responsabilidade |
|---|---|
| Python em `etl/` | Extrair, validar e consolidar os arquivos historicos |
| Backend | Autenticacao, cadastros, carga, consultas, propostas e indexacao |
| PostgreSQL/PostGIS | Persistencia, procedencia, dias climaticos e dados espaciais |
| Oraculo | Conferir serie, calcular indice, gerir fila e publicar transacoes |
| Contratos | Autorizacao, garantia, condicao, pagamento unico e eventos |
| Interface e MetaMask | Interacao do usuario e assinaturas necessarias |

Docker Compose executa banco, API/indexador, oráculo e interface. `npm start`
configura e inicia esses serviços. Sepolia é externa; MetaMask fica no navegador. O volume persiste localmente; a reproducibilidade entre usuarios
vem do pacote publico versionado e da carga automatica. Testes e bancos
temporarios ficam separados do banco de uso, com arquivos em `testes/`.

No fluxo historico, uma estacao e suficiente por decisao explicita do recorte.
A ingestao de sensores, reputacao e consolidacao multifonte foram removidas.
Os arquivos do INMET nao sao apresentados como assinados por sensores. Sem visao computacional,
MQTT no ETL, pagamento escalonado ou cobertura de excesso de chuva.
