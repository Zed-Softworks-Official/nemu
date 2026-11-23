# GitHub protections for platform Releases

A platform Release is published by [`.github/workflows/publish-release.yml`](../../.github/workflows/publish-release.yml):

- A push to `canary` that changes `platform/` or `infra/prod/` since the newest `v0.*` tag cuts the next patch, signs the Canary manifest, and tags the commit `v0.MINOR.PATCH`. A dashboard-only, marketing-only, or Convex-only push skips the publish.
- An explicit **Publish Release** run ignores that skip. On `canary` it cuts a patch even when those trees match (for example a third-party digest refresh). On `master` with channel `stable` it points Stable at a Platform version already cut and moves `:latest`. When `master` is only ahead by non-platform commits, Stable reuses the newest matching cut and does not allocate or merge back.
- `core-v*` and `matter-v*` do not publish a platform Release.

The private release-signing key is the `NEMU_RELEASE_SIGNING_KEY` repository secret. It stays in the publisher.

The signed channel manifests (`canary.json`, `stable.json`) are written to the `nemu-release-channels` Vercel Blob store with the `NEMU_RELEASE_CHANNELS_BLOB_TOKEN` repository secret, and `get.nemu.sh/releases/<channel>.json` serves them. They are not GitHub release assets.

## Controls

### Branches

`master` is the default branch and the Stable branch. `canary` is the development branch: feature branches are cut from `canary` and their pull requests target `canary`, so changes ship to the Canary test environment first. Once verified there, a `canary` → `master` pull request promotes them to Stable.

Promotion pull requests are rebase-merged, so `master` gets the same commits `canary` has and the two branches never diverge. Don't merge `master` into `canary` to resolve a conflict: a rebase merge can't replay a merge commit. If the branches have diverged, rebase `canary` onto `master` instead.

1. **Branch ruleset** — `Protec`  
   Protects `master` (an explicit `refs/heads/master` condition rather than `~DEFAULT_BRANCH`, so it stays protected if the default branch ever changes): no deletion, no force-push, required signatures, one approving review, code-owner review, stale-review dismissal, resolved threads, linear history, and rebase as the only allowed merge method.

2. **Branch ruleset** — `Protect canary`  
   Same rules for `canary` as `master` (org-admin and repository-admin bypass). GitHub rejects listing the built-in Actions app as a bypass actor on this org, so a Stable publish that allocates a new version opens a sync PR into `canary` instead of pushing the branch. Human changes still go through pull requests.

### Platform version tags

1. **Tag ruleset** — `Protect platform release tags`  
   Blocks update/delete/force-push of `v0.*` tags for everyone except `@kzolt` (bypass). Creation stays open so the publish workflow can attach the signed manifest and create the tag with `GITHUB_TOKEN`.

### Immutable releases

Immutable releases are enabled on this repository. Once a `v0.*` release is published, its `release-manifest.json` cannot be replaced or deleted, and no asset is replaced in place. That is why the channel pointers live on the install host rather than on a GitHub release.

### CODEOWNERS

[`.github/CODEOWNERS`](../../.github/CODEOWNERS) marks release and install paths for `@kzolt` (enforce via branch ruleset “require code owner review”).

### Historical image tags

These rulesets still protect tags that were created before platform Releases. They do not publish a Release.

1. **Tag ruleset** — `Protect core-v release tags`  
   Blocks create/update/delete/force-push of `core-v*` tags for everyone except `@kzolt` (bypass).

2. **Environment** — `core-release`  
   Required reviewers: `@kzolt`. Deployment branches/tags limited to `core-v*`.

3. **Tag ruleset** — `Protect matter-v release tags`  
   Blocks create/update/delete/force-push of `matter-v*` tags for everyone except `@kzolt` (bypass).

4. **Environment** — `matter-release`  
   Required reviewers: `@kzolt`. Deployment branches/tags limited to `matter-v*`.

## Publish flow

```bash
# Canary: merge a platform/ or infra/prod/ change into canary.
# The first Platform version is 0.1.0.
# A minor bump is a commit message line, not the default:
#   Bump-Platform-Minor: true
#
# Force a Canary cut when the platform trees did not change
# (for example a third-party digest refresh):
# Actions → Publish Release → branch canary → channel canary.

# Stable: PR canary into master, rebase-merge it, then
# Actions → Publish Release → branch master → channel stable.
```

## Create / refresh rulesets from this repo

```bash
gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-canary.json

gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-platform-release-tags.json

gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-core-release-tags.json

gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-matter-release-tags.json
```
