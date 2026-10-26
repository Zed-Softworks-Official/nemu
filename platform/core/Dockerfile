# syntax=docker/dockerfile:1

FROM rust:1.99.1-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Core links the Updater crate. The build context is the repo root.
WORKDIR /src

COPY platform/updater/Cargo.toml platform/updater/Cargo.lock platform/updater/
COPY platform/updater/src platform/updater/src
COPY platform/core/Cargo.toml platform/core/Cargo.lock platform/core/
COPY platform/core/diesel.toml platform/core/
COPY platform/core/migrations platform/core/migrations
COPY platform/core/src platform/core/src

WORKDIR /src/platform/core

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/platform/core/target \
    cargo build --release \
    && cp /src/platform/core/target/release/nemu /usr/local/bin/nemu-core

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 nemu

COPY --from=builder /usr/local/bin/nemu-core /usr/local/bin/nemu-core

USER nemu
EXPOSE 6368

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:6368/api/health >/dev/null || exit 1

ENV NEMU_LISTEN_ADDR=0.0.0.0:6368

CMD ["nemu-core"]
