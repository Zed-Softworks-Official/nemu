#!/usr/bin/env bash
# Prints the publisher's release request: what was asked for, and the Git, tag,
# and channel facts the planner decides from. It decides nothing itself.
#
# Needs the tags fetched, gh, jq, and curl. Reads SOURCE, BRANCH, COMMIT, PUSH,
# RESUMING, MINOR_BUMP, ADVANCE_VERSION, CANDIDATE, and HOTFIX from the environment.
#
# Usage: release-facts.sh <work-directory>

set -euo pipefail

work="$1"
mkdir -p "$work"

# platform_tree: the trees a Home installs, including everything the
# nemu-matter image is built from.
# shellcheck source=scripts/platform-paths.sh
source "$(dirname "${BASH_SOURCE[0]}")/platform-paths.sh"

# The Platform version a channel serves, or null when it serves none.
channel_version() {
  local file="$work/$1.json" status
  status=$(curl -sSL --retry 3 -o "$file" -w '%{http_code}' -H 'Cache-Control: no-cache' \
    "${RELEASE_BASE_URL:-https://get.nemu.sh/releases}/$1.json?v=${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-0}-$RANDOM")
  case "$status" in
    200) jq -e '.manifest.platformVersion' "$file" ;;
    404) echo null ;;
    *)
      echo "could not read the $1 channel manifest: HTTP $status" >&2
      return 1
      ;;
  esac
}

minor="${MINOR_BUMP:-false}"
if [ "$SOURCE" = "canary" ]; then
  message=$(git log -1 --format=%B "$COMMIT")
  if grep -Eq '^Bump-Platform-Minor: true$' <<<"$message"; then
    minor="true"
  fi
fi

version_tag='^v0\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-canary\.[1-9][0-9]*)?$'
tags=$(git tag -l 'v0.*')
: > "$work/cuts.jsonl"
while IFS= read -r tag; do
  [[ "$tag" =~ $version_tag ]] || continue
  cut_commit=$(git rev-parse "refs/tags/${tag}^{commit}")
  # Only a plain Release can be a Hotfix Release, and only its signed manifest
  # says so.
  hotfix="false"
  if [[ "$tag" != *-* ]]; then
    if ! gh release download "$tag" --pattern release-manifest.json --dir "$work/$tag" --clobber; then
      echo "Platform version ${tag} has no signed manifest" >&2
      exit 1
    fi
    hotfix=$(jq '.manifest.hotfix // false' "$work/$tag/release-manifest.json")
  fi
  contains="false"
  if git merge-base --is-ancestor "$COMMIT" "$cut_commit"; then
    contains="true"
  fi
  tree=$(platform_tree "$cut_commit")
  jq -cn \
    --arg version "${tag#v}" --arg commit "$cut_commit" --arg tree "$tree" \
    --argjson hotfix "$hotfix" --argjson contains "$contains" \
    '{platformVersion: $version, commit: $commit, platformTree: $tree,
      hotfix: $hotfix, containsRequest: $contains}' >> "$work/cuts.jsonl"
done <<<"$tags"

canary=$(channel_version canary)
stable=$(channel_version stable)
tree=$(platform_tree "$COMMIT")

jq -n \
  --arg source "$SOURCE" --arg branch "$BRANCH" --arg commit "$COMMIT" --arg tree "$tree" \
  --argjson push "${PUSH:-false}" --argjson resuming "${RESUMING:-false}" --argjson minor "$minor" \
  --argjson advance "${ADVANCE_VERSION:-false}" --arg candidate "${CANDIDATE:-}" \
  --argjson hotfix "${HOTFIX:-false}" --argjson canary "$canary" --argjson stable "$stable" \
  --slurpfile cuts "$work/cuts.jsonl" \
  '{source: $source, branch: $branch, commit: $commit, platformTree: $tree, push: $push,
    resuming: $resuming,
    minorBump: $minor, advanceVersion: $advance, candidate: $candidate, hotfix: $hotfix,
    cutReleases: $cuts, channels: {canary: $canary, stable: $stable}}'
