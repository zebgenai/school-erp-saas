# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget \
  && addgroup -S app && adduser -S app -G app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

RUN mkdir -p uploads && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health/live || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
