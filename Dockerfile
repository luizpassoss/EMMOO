# EMMOO em uma imagem só: o front (React, construído pelo Vite) é entregue pela própria API (Node + Prisma).
# Serve tanto para o docker-compose quanto para serviços de hospedagem que constroem a partir de um Dockerfile.

# Etapa 1: build do front
FROM node:22-slim AS front
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Etapa 2: API, com o front pronto em /app/public
FROM node:22-slim
WORKDIR /app

# O motor do Prisma precisa do OpenSSL nas imagens "slim".
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Dependências primeiro (melhor uso de cache). O schema vem junto: o cliente do Prisma é gerado a partir dele.
COPY api/package*.json ./
COPY api/prisma ./prisma
RUN npm ci --no-audit --no-fund && npx prisma generate

COPY api/src ./src
COPY api/scripts ./scripts
COPY --from=front /web/dist ./public

ENV NODE_ENV=production \
    FRONT_DIR=/app/public \
    TZ=America/Sao_Paulo \
    PORT=3333
EXPOSE 3333

# O orquestrador consulta o endpoint de saúde (na porta que o serviço de hospedagem definir).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3333) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Ao iniciar: alinha as tabelas ao schema (nunca apaga dados: uma mudança destrutiva faz o início falhar),
# cria os dados de demonstração só se DADOS_DEMO=sim, e sobe a API.
CMD ["sh", "-c", "npx prisma db push --skip-generate && if [ \"$DADOS_DEMO\" = \"sim\" ]; then node prisma/seed.js; fi && exec node src/server.js"]
