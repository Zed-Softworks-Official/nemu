# Normalize protocol data at the MQTT boundary

Each protocol adapter owns its commissioning, fabric, and transport state. The adapter translates Devices, Components, Capabilities, Device state, and Commands into one canonical Nemu schema at the MQTT boundary. A Device represents a physical IoT product, while a Component represents an independently addressable part. Core persists and exposes only the canonical representation, while protocol-specific diagnostics remain namespaced. Nemu generates the Rust and TypeScript contracts from the canonical schema.

Capability kind describes behavior, while Capability ID identifies one Capability instance within a Device or Component. Capability IDs remain stable across adapter restarts and firmware updates. Adapters persist the mapping from protocol attributes to canonical Capability IDs. Each Capability also defines its value type, unit, readable and writable flags, constraints, and optional Component ID. Device state maps Capability IDs to typed values with observation times. Capabilities determine controls and behavior. Device type supplies only an icon, category, and default layout. Unknown protocol properties remain namespaced diagnostics.

A Device belongs to one Room. Components inherit the Device's Room unless an Owner or Member assigns a Component to another Room.

The language-neutral canonical schema lives under `packages/protocol/schema/`. Nemu generates Rust types, TypeScript types, and runtime validators from that schema. CI fails when generated artifacts differ. A small implementation comparison will select the schema format and generator before implementation begins.

Wi-Fi support uses the same adapter boundary, but Wi-Fi is a transport rather than a common device protocol. The Wi-Fi adapter contains first-party drivers for explicitly supported device APIs and families. The initial compatibility list contains Elgato Key Light and Key Light Air. Nemu has no plan to load third-party or user-installed adapter plugins.
