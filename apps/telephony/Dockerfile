FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/telephony/package.json apps/telephony/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @aicc/telephony... --filter @aicc/api...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/telephony apps/telephony
# Telephony PrismaClient ni API sxemasidan generatsiya qiladi.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/package.json apps/api/package.json
RUN pnpm --filter @aicc/shared build \
 && pnpm --filter @aicc/api exec prisma generate \
 && pnpm --filter @aicc/telephony build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/telephony ./apps/telephony
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/telephony
EXPOSE 4100
CMD ["node", "dist/main.js"]
