# syntax=docker/dockerfile:1
# Build context is the repo root (pnpm workspace).

FROM node:22-bookworm-slim AS builder

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tooling/typescript-config ./tooling/typescript-config
COPY tooling/biome-config ./tooling/biome-config
COPY apps/matter-bridge/package.json ./apps/matter-bridge/package.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @nemu/matter-bridge...

COPY apps/matter-bridge ./apps/matter-bridge

RUN pnpm --filter @nemu/matter-bridge build \
    && pnpm --filter @nemu/matter-bridge --prod deploy /out

FROM node:22-bookworm-slim AS runtime

RUN useradd --system --create-home --uid 10001 nemu \
    && mkdir -p /data && chown nemu:nemu /data

COPY --from=builder /out/node_modules /app/node_modules
COPY --from=builder /app/apps/matter-bridge/dist/index.js /app/index.js

USER nemu
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/data

CMD ["node", "index.js"]
