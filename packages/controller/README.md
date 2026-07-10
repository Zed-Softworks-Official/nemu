# `@nemu/controller`

Client-side controller connection facade. Prefers LAN (axios + WebSocket) and
falls back to the Convex relay mailbox. UI code should depend on this package,
not on transport internals.
