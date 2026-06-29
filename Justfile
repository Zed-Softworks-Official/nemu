default:
    @just --list

dev-core:
    cd apps/nemu-core && cargo watch -x run

dev:
    just dev-core
