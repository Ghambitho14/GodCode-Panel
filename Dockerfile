# syntax=docker/dockerfile:1

# Imagen base fijada por digest (en los tres FROM): el tag puede moverse, el
# digest no. Dependabot (`.github/dependabot.yml`) propone el cambio.

# ---------- Build stage ----------
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder
WORKDIR /app

# Copiar manifiestos primero para cachear las dependencias.
# patches/ va antes de npm ci: el postinstall (patch-package) los aplica ahí.
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci

# Copiar el resto del código y generar el build de producción.
COPY . .
RUN npm run build

# ---------- Production dependencies ----------
# Solo `dependencies`: vite, eslint, playwright y compañía no llegan a la imagen
# final. `--ignore-scripts` porque el postinstall (patch-package) es de
# desarrollo y los parches solo tocan el bundle, que ya se armó arriba.
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

# ---------- Production stage ----------
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
WORKDIR /app
ENV NODE_ENV=production

# Solo copiamos lo que necesita el BFF para servir la app.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Sin root: el usuario `node` ya viene en la imagen oficial. Los archivos quedan
# de root y solo se leen, así que el proceso no puede modificar su propio código.
USER node

EXPOSE 3000

# `/health` responde sin tocar Supabase: dice si el proceso está vivo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["node", "server.js"]
