FROM node:20-alpine AS builder
WORKDIR /work
COPY package.json ./
RUN corepack enable && npm install --omit=optional
COPY tsconfig.json ./
COPY ../../../tsconfig.base.json ./tsconfig.base.json
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-alpine
WORKDIR /work
COPY --from=builder /work .
EXPOSE 4000
CMD ["node", "dist/server.js"]
