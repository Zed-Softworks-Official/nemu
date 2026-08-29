# GitHub protections for image releases

Image publishes are triggered by version tags:

- `core-v*` → [`.github/workflows/publish-core.yml`](../../.github/workflows/publish-core.yml)
- `matter-v*` → [`.github/workflows/publish-matter.yml`](../../.github/workflows/publish-matter.yml)

## Controls

### nemu-core

1. **Tag ruleset** — `Protect core-v release tags`  
   Blocks create/update/delete/force-push of `core-v*` tags for everyone except `@kzolt` (bypass).

2. **Environment** — `core-release`  
   The publish workflow jobs require this environment. Required reviewers: `@kzolt`. Deployment branches/tags limited to `core-v*`.

### nemu-matter

1. **Tag ruleset** — `Protect matter-v release tags`  
   Blocks create/update/delete/force-push of `matter-v*` tags for everyone except `@kzolt` (bypass).

2. **Environment** — `matter-release`  
   The publish workflow jobs require this environment. Required reviewers: `@kzolt`. Deployment branches/tags limited to `matter-v*`.

### Shared

3. **CODEOWNERS** — [`.github/CODEOWNERS`](../../.github/CODEOWNERS)  
   Release/install paths owned by `@kzolt` (enforce via branch ruleset “require code owner review” when enabled).

## Publish flow

```bash
# Core
git tag core-v0.1.0
git push origin core-v0.1.0
# Then approve the pending deployment in GitHub Actions → Environment "core-release"

# Matter
git tag matter-v0.1.0
git push origin matter-v0.1.0
# Then approve the pending deployment in GitHub Actions → Environment "matter-release"
```

## Apply / refresh rulesets from this repo

```bash
gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-core-release-tags.json

gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-matter-release-tags.json
```
