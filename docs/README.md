# Docs

Architecture and design live in Superhuman Docs:

**[Nemu](https://docs.superhuman.com/d/_d06TiZ2FvM1)**

Use the **Skills** and **Docs** tables there (and the repo skill `.cursor/skills/nemu-docs/SKILL.md`) when changing the product. Each Docs row has a **Page** link / **Page id** to a dedicated child page with the full body — not an embedded canvas in the table.

## Kept in this repo (public / deploy)

| File | Purpose |
|------|---------|
| [deployment/install.md](deployment/install.md) | Ubuntu Server installer (`get.nemu.sh`) |
| [deployment/subdomain-cutover.md](deployment/subdomain-cutover.md) | `nemu.sh` / `app.nemu.sh` / `get.nemu.sh` |
| [deployment/github-release-protections.md](deployment/github-release-protections.md) | GHCR tag and environment protections |

These deployment docs are also copied into the Superhuman Docs table so agents can find them via Skills.
