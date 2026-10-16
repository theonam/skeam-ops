# Image standard de l'application, Node 22 sur Debian : changer d'hébergeur ne demande aucune réécriture.
# Contient le Chromium sans interface qui imprime les PDF, les outils PostgreSQL des sauvegardes et les
# scripts d'exploitation : migrations, import, effacement, sauvegarde. Origine : egm-app `Dockerfile`.
#   docker build -t application .
#   docker run -p 3000:3000 -e DATABASE_URL=… application
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build && rm -rf .next/cache

# Dépendances de production seules ; tsx et dotenv y sont, pour les scripts d'exploitation.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Client PostgreSQL 16 : pg_dump et pg_restore des sauvegardes, même version majeure que la base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/node_modules ./node_modules
# Chromium sans interface et ses bibliothèques système, pour les PDF.
RUN node node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next ./.next
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml next.config.ts tsconfig.json ./
COPY public ./public
COPY db ./db
COPY scripts ./scripts
COPY src ./src
COPY docker-entrypoint.sh ./
RUN mkdir -p /app/.storage && chown -R node:node /app/.storage
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
