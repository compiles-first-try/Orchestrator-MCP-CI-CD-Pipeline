FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json turbo.json ./
COPY packages/ packages/
COPY apps/slack-bot/ apps/slack-bot/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @rpa-platform/slack-bot... build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY --from=build /repo /repo
WORKDIR /repo/apps/slack-bot
EXPOSE 3001
CMD ["node", "dist/index.js"]
