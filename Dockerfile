# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:22-alpine AS builder
WORKDIR /app

# Instalar pnpm de forma explícita (misma versión usada localmente).
RUN npm install -g pnpm@11.9.0

# Copiar primero los manifiestos para cachear las dependencias.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copiar el resto del código y generar el build de producción.
COPY . .
RUN pnpm run build

# ---------- Production stage ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Solo copiamos lo que necesita el BFF para servir la app.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "server.js"]
