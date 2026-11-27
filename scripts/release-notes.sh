#!/usr/bin/env bash
# Prints plain-text release notes for a new platform Release: the features and
# fixes in the trees a Home installs, newest first. The notes go into the
# GitHub release and, when opted in, the signed Release manifest.
#
# A commit anywhere in the range can add a note of its own with a
# `Release-note: <text>` trailer, for what a Home's people must do, such as
# pairing their phones again. Those notes come first.
#
# The previous tag may be on the other branch: a hotfix is on master, where a
# rebase merge gave canary's commits new hashes. A commit whose change the
# previous tag already has is left out.
#
# Usage: release-notes.sh <previous-tag-or-empty> <commit>

set -euo pipefail

previous="$1"
commit="$2"
range="$commit"
[ -z "$previous" ] || range="${previous}...${commit}"

# shellcheck source=scripts/platform-paths.sh
source "$(dirname "${BASH_SOURCE[0]}")/platform-paths.sh"

git log --no-merges --right-only --cherry-pick \
  --format='%(trailers:key=Release-note,valueonly,unfold,separator=%x0a)' "$range" \
  | awk 'NF && !seen[$0]++ { print "- " substr($0, 1, 300) }'

git log --no-merges --right-only --cherry-pick --format='%s' "$range" -- "${PLATFORM_SOURCE_PATHS[@]}" \
  | awk '
      /^(feat|fix|perf|security)(\([^)]*\))?!?: / && count < 40 {
        sub(/^[a-z]+(\([^)]*\))?!?: /, "")
        sub(/ \(#[0-9]+\)$/, "")
        line = toupper(substr($0, 1, 1)) substr($0, 2)
        if (!seen[line]++) { print "- " substr(line, 1, 200); count++ }
      }'
