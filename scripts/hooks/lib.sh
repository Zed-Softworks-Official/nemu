#!/usr/bin/env bash
# Shared helpers for Husky hooks. Source from other scripts in this directory.

HOOKS_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${HOOKS_LIB_DIR}/../.." && pwd)"

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "error: ${cmd} is required for this git hook but was not found on PATH." >&2
    echo "Install: ${hint}" >&2
    exit 1
  fi
}
