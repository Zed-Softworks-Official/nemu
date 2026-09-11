# `@nemu/protocol`

Shared wire types for the controller API (REST, WebSocket, and relay envelopes).
The package has no React or Convex dependencies. It uses TypeScript and Zod.

## Numeric capabilities

`numericCapabilitySchema` defines the typed measurement contract beside the
legacy `deviceStateSchema`. It supports power, imported energy, exported
energy, voltage, and current. Each kind has one canonical unit.

Fixed-point values use `value / 10 ** scale` in the Capability's canonical
unit. `value` must be a safe integer, and `scale` ranges from 0 through 9. A
value names the constraint revision that defines its scale, inclusive bounds,
resolution, freshness limit, History admission rate, and optional accuracy.
Each revision declares when it was introduced and when it takes effect, so it
cannot change earlier observations. Use `parseNumericCapabilityValue` to
validate these rules together.

A Capability manifest lists its supported observation envelope schema
versions in increasing order. `negotiateObservationEnvelopeVersion` selects
the highest version that both manifests support and returns an explicit
incompatible result when no version overlaps.
