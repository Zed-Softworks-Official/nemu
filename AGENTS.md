# Agent notes (Nemu)

## Documentation

Architecture and design live in Superhuman Docs:

**[Nemu](https://docs.superhuman.com/d/_d06TiZ2FvM1)** (`superhuman://docs/06TiZ2FvM1`)

Before changing product code, load the project skill **`.cursor/skills/nemu-docs/SKILL.md`**: match a **Skills** row, open skill/Docs **Page**s, then edit under the listed repo globs.

Public deployment docs remain in git:

- `docs/deployment/install.md`
- `docs/deployment/subdomain-cutover.md`
- `docs/deployment/github-release-protections.md`

## Privacy (non-negotiable)

Home inventory and state stay on the controller. Convex is identity, pairing, ephemeral relay, and ACME only — never devices, rooms, telemetry, or voice.
