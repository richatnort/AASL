FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies (workspace-aware)
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --no-frozen-lockfile --filter @shopping-list/api... --filter @shopping-list/shared

# Build shared package then API
FROM deps AS builder
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY tsconfig.base.json ./
RUN pnpm --filter @shopping-list/shared build 2>/dev/null || true
RUN cd apps/api && pnpm build

# Production image — only runtime artefacts
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --no-frozen-lockfile --filter @shopping-list/api... --filter @shopping-list/shared --prod

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

COPY --from=builder --chown=appuser:appgroup /app/packages/shared/ ./packages/shared/
COPY --from=builder --chown=appuser:appgroup /app/apps/api/dist/ ./apps/api/dist/
COPY --from=builder --chown=appuser:appgroup /app/apps/api/drizzle/ ./apps/api/drizzle/
COPY --from=builder --chown=appuser:appgroup /app/apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts

USER appuser
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/server.js"]
