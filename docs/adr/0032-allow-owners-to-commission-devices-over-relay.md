# Allow Owners to commission Devices over Relay

Supersedes ADR-0030.

An Owner's Access Client may start Device commissioning over Relay, including Matter code entry and Zigbee permit-join. A Member's Access Client still needs to reach the Controller over the Home network, and Relay rejects a Member's commissioning request with `unsupported_action`. Each commissioning started over Relay writes an Audit log entry (ADR-0024) naming the Membership, the Access Client, and the protocol. It carries no Device identifiers. The Controller remains the Matter commissioner and fabric authority (ADR-0007), and any Bluetooth step runs on the Controller's radio, not the phone's.

## Considered options

ADR-0030 assumed that a phone in the Home would always reach the Controller over LAN. In practice a phone on the Home Wi‑Fi can still fall back to Relay when LAN discovery fails: DNS-rebind protection drops the issued `lan.nemu.sh` name, the self-signed `nemu.local` certificate is rejected, or the platform blocks local or cleartext traffic. An Owner who is standing next to the Device then cannot add it. We will still fix discovery, but commissioning should not depend on it. We considered also requiring a confirmation step or a client that had previously connected over LAN. We rejected both: an Owner can already administer the Home over Relay, so either guard would add friction without reducing risk.

## Consequences

The LAN-only gate is removed for Owners in the mobile UI, in `@nemu/controller`, and in Core's Relay handler. Commissioning over Relay carries the same end-to-end encrypted envelopes as other Relay traffic. ADR-0020 still requires LAN access to accept an Invitation, and Members keep the LAN requirement.
