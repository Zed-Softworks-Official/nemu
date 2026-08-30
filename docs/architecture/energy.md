# Energy Management

Status: **live dashboard, no persisted history**. Energy readings are passed
through into live device state and shown on both device detail and the Energy
dashboard. The dashboard can compare current device and outlet readings and
keeps a short session-only trend in the browser. There is still no history
table or tariff configuration.

## What exists now

The native `nemu-matter` service folds Matter Electrical Power Measurement
(`0x0090`) and Electrical Energy Measurement (`0x0091`) attributes into the
same retained state JSON as any other device state, in SI units:

| State key | Source attribute                     | Unit |
| --------- | ------------------------------------ | ---- |
| `power`   | `ActivePower`                        | W    |
| `voltage` | `Voltage` / `RMSVoltage`             | V    |
| `current` | `ActiveCurrent` / `RMSCurrent`       | A    |
| `energy`  | `CumulativeEnergyImported.energy`    | kWh  |

These live in core's in-memory state cache like brightness — shown as a power /
energy readout on device detail and aggregated in the Energy dashboard, never
written to Postgres, never sent to Convex. If a power strip carries the
measurement clusters on an aggregator endpoint rather than per outlet, those
readings fold into the **strip device's** live state (`power` / `voltage` /
`current` / `energy`). They are not a separate device. When per-outlet readings
are available in a strip's `outlets` state, the dashboard uses them for its live
breakdown without double-counting the strip in the household total.

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
- **UX (now).** Household live draw, an in-session trend, device and per-outlet
  breakdowns when available, cumulative device counters, and explicit
  unavailable/offline states.
- **UX (later).** Today / this month history and optional tariff input for cost,
  after local sample storage exists.
