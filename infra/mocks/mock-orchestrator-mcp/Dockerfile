# Build context MUST be the workspace root (..) so the shared tsconfig.base.json
# and the workspace lockfile are reachable. The previous Dockerfile tried to
# COPY ../../../tsconfig.base.json which Docker disallows (build context can't
# be escaped). docker-compose.yml's build.context is set to .. accordingly.
FROM node:20-alpine AS builder
WORKDIR /work
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rpa-platform/mock-orchestrator-mcp... build

FROM node:20-alpine
WORKDIR /work
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
ENV NODE_ENV=production
COPY --from=builder /work .
EXPOSE 4000
CMD ["node", "infra/mocks/mock-orchestrator-mcp/dist/server.js"]
