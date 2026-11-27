# syntax=docker/dockerfile:1

# nemu-matter: the matter.js Matter Protocol adapter (ADR-0036).
#
# The build context is the repo root, because the adapter uses the workspace
# package @nemu/protocol. That package is TypeScript source, which Node runs
# with its built-in type stripping (Node 22.18+). Node does not strip types in
# files under node_modules, so the image keeps the pnpm workspace layout: the
# adapter's node_modules link to packages/protocol rather than a copy of it.
#
# Debian, not Alpine: the BLE native modules (noble, hci-socket, usb,
# serialport) load glibc prebuilds at runtime.

FROM node:22.22.0-bookworm-slim AS builder

# The pnpm in the root package.json's packageManager field. The corepack
# bundled with Node 22 cannot run pnpm 12.
ARG PNPM_VERSION=12.21.0
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION}

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY tooling/typescript-config tooling/typescript-config
COPY tooling/biome-config tooling/biome-config
COPY packages/protocol packages/protocol
COPY platform/matter-adapter platform/matter-adapter

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @nemu/matter-adapter... \
    && pnpm --filter @nemu/matter-adapter build \
    && rm -rf node_modules platform/matter-adapter/node_modules packages/protocol/node_modules \
        tooling/*/node_modules \
    && pnpm install --frozen-lockfile --prod --filter @nemu/matter-adapter... \
    && rm -rf platform/matter-adapter/src \
    && find platform/matter-adapter/dist -name '*.test*.js' -delete

FROM node:22.22.0-bookworm-slim AS runtime

# The node image's own `node` user is uid 1000, which owns the data volume
# (the installer chowns it); rename it to match the Rust image's `nemu` user.
RUN usermod --login nemu --move-home --home /home/nemu node \
    && groupmod --new-name nemu node \
    && mkdir -p /data \
    && chown nemu:nemu /data

WORKDIR /app

COPY --from=builder /src/node_modules node_modules
COPY --from=builder /src/packages/protocol packages/protocol
COPY --from=builder /src/platform/matter-adapter/package.json platform/matter-adapter/package.json
COPY --from=builder /src/platform/matter-adapter/node_modules platform/matter-adapter/node_modules
COPY --from=builder /src/platform/matter-adapter/dist platform/matter-adapter/dist

USER nemu
WORKDIR /app/platform/matter-adapter

ENV NODE_ENV=production \
    MQTT_HOST=127.0.0.1 \
    MQTT_PORT=1883 \
    MQTT_BASE_TOPIC=matter \
    MATTER_DATA_DIR=/data

# Asks the adapter over MQTT, as Core does (src/healthcheck.ts).
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD ["node", "dist/healthcheck.js"]

CMD ["node", "dist/main.js"]
