#!/usr/bin/env bash
# Tests scripts/platform-paths.sh, which release-facts.sh and release-notes.sh
# share:
# - every path a Dockerfile under platform/ copies from the build context is a
#   platform path, so a change to it alone cuts a Canary candidate;
# - platform_tree moves for a protocol-only change and not for a dashboard one.
#
# Usage: scripts/platform-paths.test.sh

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=scripts/platform-paths.sh
source "$here/platform-paths.sh"

failed=0
fail() {
  echo "not ok - $*" >&2
  failed=1
}

covered() {
  local path="${1%/}" platform
  for platform in "${PLATFORM_SOURCE_PATHS[@]}" "${PLATFORM_BUILD_FILES[@]}"; do
    [[ "$path" == "$platform" || "$path" == "$platform"/* ]] && return 0
  done
  return 1
}

# Every COPY from the build context (not --from another stage) in each image.
while IFS= read -r dockerfile; do
  while IFS= read -r line; do
    read -ra words <<<"$line"
    sources=()
    for word in "${words[@]:1}"; do
      [[ "$word" == --* ]] || sources+=("$word")
    done
    # The last word is the destination.
    for source in "${sources[@]:0:${#sources[@]}-1}"; do
      covered "$source" || fail "${dockerfile#"$root"/} copies $source, which is not a platform path"
    done
  done < <(grep -E '^COPY ' "$dockerfile" | grep -v -- '--from=')
done < <(find "$root/platform" -name Dockerfile -not -path '*/node_modules/*')

# platform_tree in a scratch repository.
repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT
git -C "$repo" init -q
commit() {
  git -C "$repo" add -A
  git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit -q -m "$1"
  git -C "$repo" rev-parse HEAD
}
tree_at() {
  (cd "$repo" && platform_tree "$1")
}
mkdir -p "$repo/platform/core" "$repo/packages/protocol/src" "$repo/apps/dashboard"
echo core >"$repo/platform/core/main.rs"
echo protocol >"$repo/packages/protocol/src/index.ts"
echo dashboard >"$repo/apps/dashboard/page.tsx"
base=$(commit base)
echo protocol-change >>"$repo/packages/protocol/src/index.ts"
protocol=$(commit protocol)
echo dashboard-change >>"$repo/apps/dashboard/page.tsx"
dashboard=$(commit dashboard)

[ "$(tree_at "$base")" != "$(tree_at "$protocol")" ] ||
  fail "a packages/protocol-only change does not move the platform tree"
[ "$(tree_at "$protocol")" = "$(tree_at "$dashboard")" ] ||
  fail "a dashboard-only change moves the platform tree"

if [ "$failed" -eq 0 ]; then
  echo "ok - platform paths"
fi
exit "$failed"
