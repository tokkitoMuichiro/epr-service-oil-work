# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY client client
COPY server server
RUN npm run build

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace=server --no-audit --no-fund && mkdir -p server/node_modules

FROM ${NODE_IMAGE}
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    TZ=Europe/Moscow \
    HOST=0.0.0.0 \
    PORT=4568 \
    DB_PATH=/data/erp.sqlite \
    BACKUP_DIR=/data/backups \
    CLIENT_DIST=/app/client/dist \
    APP_VERSION=${APP_VERSION}
WORKDIR /app/server
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/server/node_modules ./node_modules
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/client/dist /app/client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4568
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4568)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server/src/index.js"]
