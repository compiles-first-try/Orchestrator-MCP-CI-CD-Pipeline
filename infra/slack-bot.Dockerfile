# See infra/api.Dockerfile for the build context rationale.
FROM node:20-alpine AS builder
WORKDIR /work
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rpa-platform/slack-bot... build

FROM node:20-alpine
WORKDIR /work
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
ENV NODE_ENV=production
COPY --from=builder /work .
EXPOSE 3001
CMD ["node", "apps/slack-bot/dist/start.js"]
