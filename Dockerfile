# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:22.14-alpine AS builder
WORKDIR /app

# Copiar manifiestos primero para cachear las dependencias.
COPY package.json package-lock.json ./
RUN npm ci

# Copiar el resto del código y generar el build de producción.
COPY . .
RUN npm run build

# ---------- Production stage ----------
FROM node:22.14-alpine
WORKDIR /app
ENV NODE_ENV=production

# Solo copiamos lo que necesita el BFF para servir la app.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "server.js"]
