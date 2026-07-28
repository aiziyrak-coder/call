FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/ai-worker/package.json apps/ai-worker/
RUN pnpm install --frozen-lockfile --filter @aicc/ai-worker...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/ai-worker apps/ai-worker
RUN pnpm --filter @aicc/shared build && pnpm --filter @aicc/ai-worker build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/ai-worker ./apps/ai-worker
WORKDIR /app/apps/ai-worker
EXPOSE 4200 8090
CMD ["node", "dist/main.js"]
