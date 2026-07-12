#!/usr/bin/env bash
# Monorepo dev wrapper: clean up orphaned nemu-core if turbo's shutdown misses it.
set -euo pipefail

# shellcheck source=scripts/stop-nemu-core.sh
source "$(dirname "$0")/stop-nemu-core.sh"

trap stop_nemu_core EXIT INT TERM

exec turbo run dev
