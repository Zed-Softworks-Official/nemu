# nemu

A privacy-first smart home controller. All home state — devices, names, rooms,
telemetry, voice audio — lives on a Raspberry Pi you own. The cloud handles
only accounts, controller pairing, and an ephemeral relay for remote access;
it never stores anything about your home.

Two parts:

- **nemu-core** ([`apps/core`](apps/core)) — Rust (Axum + Diesel + rumqttc)
  running on the Pi alongside Mosquitto, zigbee2mqtt, and Postgres via Docker
  Compose. Owns device control, state, the API, and the fully local voice
  pipeline (wake word → whisper.cpp → intent → Piper).
- **nemu-web** (`apps/web`, planned) — Next.js + Convex + Clerk webview for
  account creation, controller pairing, and controlling the home. Connects
  directly over the LAN when home, falls back to an ephemeral cloud relay when
  away.

## Documentation

- [Design doc & deliverables](docs/DESIGN.md)
- Architecture:
  - [Overview](docs/architecture/overview.md) — system diagram, hybrid connectivity, trust boundaries
  - [Rust core](docs/architecture/core.md)
  - [Webview (Next.js / Convex / Clerk)](docs/architecture/webview.md)
  - [Voice pipeline](docs/architecture/voice.md)
  - [Data model](docs/architecture/data-model.md)

## Development

Requires Docker, Rust, `diesel_cli`, and [`just`](https://github.com/casey/just).

```bash
just infra       # start mosquitto, zigbee2mqtt, postgres
just db-setup    # create the database and run migrations
just dev-core    # run the core with cargo watch
just             # list all recipes
```
