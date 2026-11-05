FROM node:24-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate

# Copy package files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY patches ./patches
COPY packages ./packages
COPY tooling ./tooling
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/patches ./patches
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/tooling ./tooling
COPY --from=deps /app/apps/api ./apps/api
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY turbo.json ./

# Build the API and its workspace dependencies (@subscriber.dev/shared, /db, /auth, ...)
# via turbo, since apps/api's own "build" script is a bare tsc with no knowledge of
# upstream packages whose "types" exports point at a dist/ that must exist first.
RUN pnpm build --filter=@subscriber.dev/api
RUN pnpm --filter=@subscriber.dev/api deploy --prod --legacy /prod/api
# ponytail: better-auth's optional peers, resolved from web; the api never imports them
RUN rm -rf /prod/api/node_modules/next /prod/api/node_modules/@next /prod/api/node_modules/drizzle-kit

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /prod/api ./apps/api
COPY --from=builder --chown=nestjs:nodejs /app/packages/db/migrations ./packages/db/migrations

USER nestjs

WORKDIR /app/apps/api

EXPOSE 4000

ENV PORT=4000

CMD ["node", "dist/main.js"]
