# Build the api image. Build context MUST be the workspace root (..) so
# pnpm-workspace.yaml + every package's package.json are available for
# pnpm install. .dockerignore at the workspace root excludes node_modules,
# dist, .git, etc.
FROM node:20-alpine AS builder
WORKDIR /work
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy the full workspace (filtered by .dockerignore) and install.
# We don't try to optimize the install layer per-package because the workspace
# graph means almost any change invalidates the install layer anyway; copy
# everything once and rebuild the affected slice.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rpa-platform/api... build

FROM node:20-alpine
WORKDIR /work
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
ENV NODE_ENV=production
COPY --from=builder /work .
EXPOSE 3000
CMD ["node", "apps/api/dist/start.js"]
