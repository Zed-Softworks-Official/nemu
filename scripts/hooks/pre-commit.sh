#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/hooks/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

cd "${REPO_ROOT}"

require_cmd gitleaks "https://github.com/gitleaks/gitleaks#installing"

pnpm exec lint-staged --relative

echo "pre-commit: rustfmt via turbo"
pnpm fmt:rust
mapfile -t staged_rs < <(git diff --cached --name-only --diff-filter=ACMR -- '*.rs')
if [[ ${#staged_rs[@]} -gt 0 ]]; then
  git add -- "${staged_rs[@]}"
fi

gitleaks protect --staged --redact --no-banner
