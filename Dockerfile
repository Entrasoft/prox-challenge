# syntax=docker/dockerfile:1
# Direct Cloud Run alternative to Firebase App Hosting (see docs/DEPLOY.md).
# Deliberately NOT Next.js `output: 'standalone'` — the Agent SDK ships a CLI binary it
# spawns at request time; keeping full node_modules avoids file-tracing dropping it.

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOME=/tmp \
    CLAUDE_CONFIG_DIR=/tmp/.claude \
    USAGE_LOG_DIR=/tmp \
    PORT=8080
# Built app + full deps + the committed KB (served at runtime) + public assets.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/kb ./kb
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
EXPOSE 8080
CMD ["npm", "run", "start"]
