# The paths a Home installs from. Sourced by release-facts.sh and
# release-notes.sh, so a Release candidate is cut, and its notes are written,
# from the same set.
#
# PLATFORM_SOURCE_PATHS: platform/ and infra/prod/, plus every other source
# tree an image is built from. nemu-matter copies the workspace package
# @nemu/protocol and the shared tooling configs (platform/matter-adapter/
# Dockerfile), so a change to any of them alone is a platform change.
#
# PLATFORM_BUILD_FILES: the workspace files that Dockerfile also copies. They
# move the platform tree but not the release notes: a dashboard commit that
# bumps the lockfile is not a Home feature.
#
# platform-paths.test.sh fails when a Dockerfile under platform/ copies a path
# these lists don't cover.

PLATFORM_SOURCE_PATHS=(
  platform
  infra/prod
  packages/protocol
  tooling/typescript-config
  tooling/biome-config
)

PLATFORM_BUILD_FILES=(
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
)

# Identity of every platform path at a commit. Dashboard and Convex changes do
# not move it.
platform_tree() {
  local path object identity=""
  for path in "${PLATFORM_SOURCE_PATHS[@]}" "${PLATFORM_BUILD_FILES[@]}"; do
    object=$(git rev-parse -q --verify "$1:$path" || true)
    identity+="${identity:+-}${object:-none}"
  done
  printf '%s' "$identity"
}
