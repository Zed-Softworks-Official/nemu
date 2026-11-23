# Require LAN access for mobile Device commissioning

Superseded by ADR-0032, which lets Owners commission over Relay.

Mobile Device commissioning, including Matter QR and Bluetooth proximity flows and Zigbee permit-join, requires the Access Client to reach the Controller over the Home network. Relay rejects commissioning requests with `unsupported_action` instead of starting a flow it cannot finish. Commissioning already depends on physical proximity, so a Relay path would add protocol work and remote-enrollment risk without a real use case. This matches ADR-0020, which requires LAN access to accept Invitations. The Controller remains the Matter commissioner and fabric authority as ADR-0007 requires.
