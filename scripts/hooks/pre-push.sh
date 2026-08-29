#!/usr/bin/env bash
# Pre-push: Turbo-cached typecheck + Clippy. Unchanged packages are cache hits.
set -euo pipefail

# shellcheck source=scripts/hooks/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

cd "${REPO_ROOT}"

echo "pre-push: TypeScript check-types via turbo"
pnpm check-types

echo "pre-push: Clippy security lints via turbo"
pnpm clippy
