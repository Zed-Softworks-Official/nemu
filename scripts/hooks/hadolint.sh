#!/usr/bin/env bash
# Lint staged Dockerfiles. lint-staged passes matching paths as arguments.
set -euo pipefail

# shellcheck source=scripts/hooks/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_cmd hadolint "https://github.com/hadolint/hadolint#install"

if [[ $# -eq 0 ]]; then
  exit 0
fi

hadolint "$@"
