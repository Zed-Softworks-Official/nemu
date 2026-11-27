# Build the Matter adapter on matter.js

Status: accepted, not yet implemented (NEM-109). Applies the Protocol adapter boundary from ADR-0002 and ADR-0019 to a new implementation.

The Matter Protocol adapter moves from Rust and the `matter-controller` crate to a TypeScript process built on matter.js (`@matter/main`, with `@matter/nodejs-ble` for BLE). The crate was months old, had few users, shipped breaking releases about weekly, and needed Nemu-side workarounds for commissioning failures. matter.js has a long-term maintainer in the Open Home Foundation and runs Home Assistant's Matter Server, so far more devices exercise it. The adapter stays a Protocol adapter: MQTT remains its only link to Core, Core gains no Matter library, and the adapter keeps the existing topics and payloads. New behavior arrives as new topics, and a change to an existing payload is its own change with matching Core work.

## Considered options

- **Stay on `matter-controller`.** Rejected because Nemu would keep absorbing a young library's churn and defects inside the component that holds the Home's Matter fabric.
- **Run Home Assistant's matterjs-server and bridge it to MQTT.** Rejected because it adds a second process, store and version track, and its WebSocket API follows Home Assistant's model rather than Nemu's Devices, Components and Capabilities.

## Consequences

The Controller is no longer a single-language Rust platform: the Matter adapter ships as a Node image under the same `nemu-matter` name. Its memory use on a Raspberry Pi 4 must stay within the budget set in NEM-109, or this decision is revisited. Switching starts a new fabric, so existing Matter Devices are removed and commissioned again. matter.js talks to the Bluetooth adapter directly (HCI) instead of through BlueZ over D-Bus. Adapter state stays under the adapter's data volume, so Home backups include it unchanged.
