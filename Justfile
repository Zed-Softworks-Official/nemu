default:
    @just --list

# Development

infra:
    docker compose -f docker-compose.dev.yml up -d

infra-down:
    docker compose -f docker-compose.dev.yml down

dev-core:
    cd apps/nemu-core && cargo watch -x run

dev: infra
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    just dev-core
    wait

# DB
db-migrate:
    cd apps/nemu-core && diesel migration run

db-revert:
    cd apps/nemu-core && diesel migration revert

db-new name:
    cd apps/nemu-core && diesel migration generate {{ name }}

db-reset:
    cd apps/nemu-core && diesel migration reset

db-setup:
    cd apps/nemu-core && diesel setup
