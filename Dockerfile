# ========================================================
# Dockerfile: Unified Production Build for Campus Hunt SDMCET
# ========================================================

# Stage 1: Build Client & Server
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./
COPY packages/client/package*.json ./packages/client/
COPY packages/server/package*.json ./packages/server/

# Install all dependencies across monorepo
RUN npm ci

# Copy Prisma schema and generate client
COPY packages/server/prisma ./packages/server/prisma
RUN npx prisma generate --schema=./packages/server/prisma/schema.prisma

# Copy full source code
COPY . .

# Build Client (Vite) and Server (TypeScript)
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Install openssl for Prisma runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./
COPY packages/client/package*.json ./packages/client/
COPY packages/server/package*.json ./packages/server/

# Copy dependencies and generated prisma client
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled artifacts
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create data and uploads directories
RUN mkdir -p /app/packages/server/uploads /app/data

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
