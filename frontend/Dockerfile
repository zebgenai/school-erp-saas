# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache nginx wget \
  && mkdir -p /run/nginx /usr/share/nginx/html \
  && rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# SSR bundle (Nitro/TanStack) externalizes packages such as h3-v2.
# Install production node_modules from the lockfile so Node can resolve them.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist/client /usr/share/nginx/html
COPY --from=builder /app/dist/server /app/dist/server
COPY scripts/docker-server.mjs /app/scripts/docker-server.mjs

ENV NODE_ENV=production
ENV SSR_HOST=127.0.0.1
ENV SSR_PORT=3001

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
