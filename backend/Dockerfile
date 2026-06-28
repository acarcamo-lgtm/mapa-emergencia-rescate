# Backend Express (TS). Contexto de build = RAÍZ del repo (necesita backend/ +
# infra/db/schema.ts, que el backend importa con ../../../infra/db/schema.js).
#   docker build -f backend/Dockerfile -t mapa-backend .
FROM node:20-slim AS base
WORKDIR /app

# Deps del backend. Se instalan en /app/node_modules (RAÍZ) — NO en /app/backend
# — para que TANTO backend/ COMO infra/db/schema.ts resuelvan drizzle-orm/etc.
# (Node sube por los directorios padre buscando node_modules; infra/ es hermano
# de backend/, así que necesita el node_modules en el ancestro común /app).
FROM base AS deps
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY backend ./backend
COPY infra/db ./infra/db
WORKDIR /app/backend
ENV PORT=8080
EXPOSE 8080
# tsx ejecuta TypeScript directo (resuelve el alias @/ del tsconfig del backend).
CMD ["npx", "tsx", "src/server.ts"]
