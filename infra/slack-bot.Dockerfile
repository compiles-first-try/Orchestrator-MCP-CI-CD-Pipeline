FROM node:20-alpine AS builder
WORKDIR /work
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @rpa-platform/slack-bot... build

FROM node:20-alpine
WORKDIR /work
COPY --from=builder /work .
EXPOSE 3001
CMD ["node", "apps/slack-bot/dist/start.js"]
