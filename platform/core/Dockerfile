# syntax=docker/dockerfile:1

FROM rust:1.98-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY migrations ./migrations
COPY diesel.toml ./
COPY src ./src

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release \
    && cp /app/target/release/nemu /usr/local/bin/nemu-core

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
