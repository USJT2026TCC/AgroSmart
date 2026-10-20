# Preparacao historica

A serie publica preparada acompanha o projeto em `backend/recursos/inmet/A770`.
Outra instalacao nao precisa baixar os ZIPs nacionais nem executar Python: use
Docker Desktop aberto e `npm start`. A API aplica esquema e carga inicial no
PostgreSQL; o volume preserva o banco e anos identicos nao sao reimportados.

O simulador e uma ferramenta de preparacao da fonte. Para reconstruir a serie,
consulte [simulador/README.md](../simulador/README.md), execute apenas `npm run dados:preparar`, que tambem atualiza o pacote. Os originais e hashes acompanham os diarios, sem qualquer dump
de usuarios, carteiras ou segredos. Regras de cobertura continuam em ESCOPO-ATUAL.md.

O modulo agora contem somente ETL: sem MQTT, assinaturas de estacao, envio
cadenciado ou deslocamento de datas. A carga e feita pelo backend em `inmet_dias`;
o oraculo consulta a serie pela API autenticada, calcula o indice e publica no
contrato historico. A fonte unica e A770. A contagem comeca no inicio da cobertura.

O volume Docker nao distribui bancos entre pessoas: cada instalacao importa o
mesmo pacote publico versionado. Os demais servicos rodam no host pelo iniciador.
