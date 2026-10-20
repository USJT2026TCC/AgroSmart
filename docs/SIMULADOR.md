# Preparacao historica

A serie publica preparada acompanha o projeto em `backend/recursos/inmet/A770`.
Outra instalacao nao precisa baixar os ZIPs nacionais nem executar Python: use
Docker Desktop aberto e `npm start`. A API aplica esquema e carga inicial no
PostgreSQL; o volume preserva o banco e anos identicos nao sao reimportados.

O simulador e uma ferramenta de preparacao da fonte. Para reconstruir a serie,
consulte [simulador/README.md](../simulador/README.md), execute `dados:preparar` e
`dados:empacotar`. Os originais e hashes acompanham os diarios, sem qualquer dump
de usuarios, carteiras ou segredos. Regras de cobertura continuam em ESCOPO-ATUAL.md.
