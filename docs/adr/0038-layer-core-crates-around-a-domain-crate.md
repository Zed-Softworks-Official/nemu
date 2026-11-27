# Layer Core crates around a domain crate

Status: accepted, not yet implemented.

Core moves from one crate to a Cargo workspace rooted at `platform/` (it also contains the Updater; the Matter adapter stays outside it until ADR-0036 replaces it). The split follows dependency direction, not folders. A domain crate, `home`, owns the Home's operations, the caller identity, and the domain errors. The transports (`api` for HTTP and WebSocket, `relay`, `mqtt`) depend on `home` and never on each other. `protocol` holds the wire types WebSocket and Relay share. `db` owns the schema and migrations. `core` is the binary: it reads configuration, owns LAN TLS and the Updater socket client, and wires everything together. This makes the compiler enforce the boundaries that ADR-0002 and ADR-0023 describe. It also means editing a transport doesn't rebuild the domain.

## Considered options

- **One crate per folder (`api`, `ws`, `relay`, `db`).** Rejected. The Relay calls HTTP handlers directly, and capabilities and pairing borrow HTTP auth and error types, so carving along folder lines would turn those cycles into crate cycles or one dependency hub.
- **A separate WebSocket crate.** Rejected. WebSocket is a route on the same axum server with the same auth. It is one of two transports for the one Client–Controller protocol, and `protocol` already gives it a shared contract with Relay.
- **Split Capabilities and History out of `home` now.** Deferred until workspace build times can be measured.

## Consequences

Library crates keep their internals crate-private, and each one exports on purpose what transports need. They report through `tracing` alone and know nothing about Error reporting (ADR-0037), which only the binary installs. `mqtt` implements a Command-publisher trait that `home` owns, which breaks the devices–MQTT cycle. A dependency-direction check keeps the layering from eroding.
