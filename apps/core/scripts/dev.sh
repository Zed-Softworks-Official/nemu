#!/usr/bin/env bash
# Dev wrapper: ensure `nemu` exits when turbo/pnpm sends SIGINT/SIGTERM.
# cargo-watch runs children in a separate process group by default, so a plain
# bash trap on $$ does not reach the compiled binary.
set -euo pipefail

# shellcheck source=../../../scripts/stop-nemu-core.sh
source "$(dirname "$0")/../../../scripts/stop-nemu-core.sh"

trap stop_nemu_core EXIT INT TERM

# Keep `cargo run` / `nemu` in this shell's process group so signals propagate.
cargo watch --no-process-group -x run
