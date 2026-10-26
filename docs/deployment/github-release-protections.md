# GitHub protections for platform Releases

A platform Release is published by [`.github/workflows/publish-release.yml`](../../.github/workflows/publish-release.yml):

- A push to `canary` cuts the next patch, signs the Canary manifest, and tags the commit `v0.MINOR.PATCH`.
- An explicit **Publish Release** run on `master` with channel `stable` points Stable at a Platform version already cut and moves `:latest`.
- `core-v*` and `matter-v*` do not publish a platform Release.

The private release-signing key is the `NEMU_RELEASE_SIGNING_KEY` repository secret. It stays in the publisher.

## Controls

### CODEOWNERS

[`.github/CODEOWNERS`](../../.github/CODEOWNERS) marks release and install paths for `@kzolt` (enforce via branch ruleset “require code owner review” when enabled).

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
# Canary: push the canary branch. The first Platform version is 0.1.0.
# A minor bump is a commit message line, not the default:
#   Bump-Platform-Minor: true

# Stable: Actions → Publish Release → branch master → channel stable.
```

## Create historical rulesets from this repo

```bash
gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-core-release-tags.json

gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-matter-release-tags.json
```
