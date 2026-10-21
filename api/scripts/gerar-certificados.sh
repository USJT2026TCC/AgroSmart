#!/bin/sh
# Certificados de DESENVOLVIMENTO para o canal cifrado (RNF17).
#
# Gera uma autoridade certificadora local e, assinado por ela, o certificado do
# servidor para "localhost" e 127.0.0.1. Clientes Node podem confiar nesta CA
# configurando NODE_EXTRA_CA_CERTS com o caminho de autoridade.crt.
# O ETL historico nao envia leituras a esta API.
#
# Nada aqui vai para o repositorio (dados/ esta no .gitignore). Em producao, o
# certificado vem de uma autoridade publica, e nao deste script.
#
# Uso, a partir de api/:   sh scripts/gerar-certificados.sh
set -e

DESTINO="${1:-dados/tls}"
mkdir -p "$DESTINO"
cd "$DESTINO"

# MSYS (Git Bash no Windows) converteria "/CN=..." em caminho de arquivo.
export MSYS_NO_PATHCONV=1

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout autoridade.key -out autoridade.crt \
  -subj "/CN=AgroSmart - autoridade de desenvolvimento" 2>/dev/null

openssl req -newkey rsa:2048 -nodes \
  -keyout servidor.key -out servidor.csr \
  -subj "/CN=localhost" 2>/dev/null

printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" > servidor.ext

openssl x509 -req -in servidor.csr -CA autoridade.crt -CAkey autoridade.key -CAcreateserial \
  -days 365 -out servidor.crt -extfile servidor.ext 2>/dev/null

rm -f servidor.csr servidor.ext autoridade.srl

echo "Gerados em $DESTINO:"
echo "  servidor.crt / servidor.key   -> TLS_CERTIFICADO / TLS_CHAVE no api/.env"
echo "  autoridade.crt                -> CA local para clientes HTTPS"
