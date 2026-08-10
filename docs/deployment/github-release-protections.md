# GitHub protections for controller image releases

Image publishes are triggered only by `core-v*` tags (see [`.github/workflows/publish-core.yml`](../../.github/workflows/publish-core.yml)).

## Controls

1. **Tag ruleset** — `Protect core-v release tags`  
   Blocks create/update/delete/force-push of `core-v*` tags for everyone except `@kzolt` (bypass).

2. **Environment** — `core-release`  
   The publish workflow jobs require this environment. Required reviewers: `@kzolt`. Deployment branches/tags limited to `core-v*`.

3. **CODEOWNERS** — [`.github/CODEOWNERS`](../../.github/CODEOWNERS)  
   Release/install paths owned by `@kzolt` (enforce via branch ruleset “require code owner review” when enabled).

## Publish flow

```bash
git tag core-v0.1.0
git push origin core-v0.1.0
# Then approve the pending deployment in GitHub Actions → Environment "core-release"
```

## Apply / refresh ruleset from this repo

```bash
gh api repos/Zed-Softworks-Official/nemu/rulesets \
  --method POST \
  --input .github/rulesets/protect-core-release-tags.json
```
