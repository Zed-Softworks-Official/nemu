#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/hooks/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

cd "${REPO_ROOT}"

pnpm exec commitlint --edit "$1"
