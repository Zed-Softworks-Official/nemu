default:
    @just --list

# Development
build:
    cd core && cargo build

infra:
    docker compose -f docker-compose.dev.yml up -d

infra-down:
    docker compose -f docker-compose.dev.yml down

dev-core:
    cd core && cargo watch -x run

dev: infra
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    just dev-core
    wait

# DB
db-migrate:
    cd core && diesel migration run

db-revert:
    cd core && diesel migration revert

db-new name:
    cd core && diesel migration generate {{ name }}

db-reset:
    cd core && diesel migration reset

db-setup:
    cd core && diesel setup
