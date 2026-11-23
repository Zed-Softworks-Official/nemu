# Allow every Membership to commission Devices over Relay

Supersedes ADR-0032.

Any Membership's Access Client, Owner or Member, may start Device commissioning over Relay, including Matter code entry and Zigbee permit-join. Each commissioning started over Relay writes an Audit log entry (ADR-0024) naming the Membership, the Access Client, and the protocol. It carries no Device identifiers. The Controller remains the Matter commissioner and fabric authority (ADR-0007), and any Bluetooth step runs on the Controller's radio, not the phone's.

More generally, Relay matches LAN for every authorized operation except the three Presence checks: accepting an Invitation (ADR-0020), Recovery Key recovery (ADR-0012), and deleting a Home (ADR-0025). Those still need the Access Client to reach the Controller over the Home network. Every other operation has the same request, outcome, and authorization over both transports (ADR-0023), and Core enforces the Membership's permissions the same way on each (ADR-0005, ADR-0006).

## Considered options

ADR-0032 let only Owners commission over Relay, so a Member on the Home Wi‑Fi whose phone fell back to Relay still could not add a Device they were standing next to. Members may already add, rename, and remove Devices over LAN (ADR-0006), so the LAN requirement only tested whether LAN discovery worked, not whether the person was trusted to commission. We kept Owner-only commissioning over Relay as the alternative and rejected it: it added a transport-specific rule without reducing risk, and the Audit log entry already makes remote enrollment visible to Owners. We also considered treating every operation the same over Relay with no exceptions. We rejected that because the three Presence checks rely on reaching the Controller over the Home network as proof of being in the Home, and Relay cannot give that proof.

## Consequences

Core's Relay handler stops rejecting a Member's commissioning request with `unsupported_action`, and the mobile UI offers commissioning over Relay to every Membership. A new operation that differs between LAN and Relay needs to be a Presence check, or it needs a new decision that amends this one.
