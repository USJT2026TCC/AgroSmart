FROM node:24-bookworm-slim AS construcao
WORKDIR /agrosmart
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY oraculo/package.json oraculo/package.json
COPY interface/package.json interface/package.json
COPY blockchain/package.json blockchain/package.json
COPY testes/package.json testes/package.json
RUN npm ci --ignore-scripts --workspace agrosmart-backend --workspace agrosmart-oraculo --workspace agrosmart-app
COPY api api
COPY oraculo oraculo
COPY interface interface
COPY blockchain/implantacoes blockchain/implantacoes
COPY configuracao configuracao
COPY scripts/servir-interface.mjs scripts/servir-interface.mjs
RUN npm run build --workspace agrosmart-app && npm prune --omit=dev --ignore-scripts --workspace agrosmart-backend --workspace agrosmart-oraculo --workspace agrosmart-app

FROM node:24-bookworm-slim
WORKDIR /agrosmart
COPY --from=construcao /agrosmart /agrosmart
ENV NODE_ENV=demonstracao REDE=sepolia
CMD ["node", "api/src/index.js"]
