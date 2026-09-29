# Imagem da API EMMOO (Node 22 + Prisma)
FROM node:22-slim

WORKDIR /app

# O motor do Prisma precisa do OpenSSL nas imagens "slim".
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Dependências primeiro (melhor uso de cache). O schema é copiado antes porque
# o @prisma/client gera o cliente durante a instalação.
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3333

# Observabilidade básica: o orquestrador consulta o endpoint de saúde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
