# syntax=docker/dockerfile:1

FROM rust:1.98-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libdbus-1-dev \
        pkg-config \
        cmake \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY src ./src

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release \
    && cp /app/target/release/nemu-matter /usr/local/bin/nemu-matter

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 1000 nemu \
    && mkdir -p /data \
    && chown nemu:nemu /data

COPY --from=builder /usr/local/bin/nemu-matter /usr/local/bin/nemu-matter

USER nemu

ENV MQTT_HOST=127.0.0.1 \
    MQTT_PORT=1883 \
    MQTT_BASE_TOPIC=matter \
    MATTER_DATA_DIR=/data

CMD ["nemu-matter"]
