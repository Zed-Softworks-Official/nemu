# Energy Management (future)

Status: **not built**. This stub scopes the eventual energy section so the
Matter work doesn't paint us into a corner. Today, energy readings are passed
through into live device state only — no UI, no history, no tables.

## What exists now

The `matter-bridge` sidecar folds Matter Electrical Power Measurement
(`0x0090`) and Electrical Energy Measurement (`0x0091`) attributes into the
same retained state JSON as any other device state, in SI units:

| State key | Source attribute                     | Unit |
| --------- | ------------------------------------ | ---- |
| `power`   | `ActivePower`                        | W    |
| `voltage` | `Voltage` / `RMSVoltage`             | V    |
| `current` | `ActiveCurrent` / `RMSCurrent`       | A    |
| `energy`  | `CumulativeEnergyImported.energy`    | kWh  |

These live in core's in-memory state cache like brightness — visible on the
device detail "Current state" card, never written to Postgres, never sent to
Convex. If a power strip carries the measurement clusters on an aggregator
endpoint rather than per outlet, the sidecar exposes that endpoint as a
read-only "All outlets" sibling device so the readings have a home.

## Constraints for the future section

- **Local-only.** Wattage, cumulative kWh, and any derived cost stay on the
  controller. The Convex schema stays empty of telemetry — the same privacy
  contract as device state.
- **Source-agnostic.** Matter energy clusters are the first producer, but
  zigbee2mqtt `power`/`energy`/`current`/`voltage` exposes must feed the same
  model, so a mixed home gets one energy section.
- **Storage.** Likely a dedicated append-only `energy_samples` table
  (`device_id`, `watts`, `kwh`, `timestamp`) with aggressive downsampling —
  **not** `device_events`, which would explode at power-meter reporting
  rates. Live values remain the state cache.
- **UX (later).** Household overview (now / today / this month), per-outlet
  breakdown for strips, optional tariff input for cost. No UI in the current
  implementation.
