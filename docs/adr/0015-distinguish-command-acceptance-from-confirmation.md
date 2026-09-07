# Distinguish Command acceptance from confirmation

Every Command has an idempotency key. `accepted` means that Core validated and durably admitted the Command for dispatch; it is transitional and does not prove that MQTT publication or Device execution occurred. Final outcomes are `confirmed`, `rejected`, `failed`, and `unconfirmed`. A Device-state update confirms the Command. A validation or availability check rejects it before dispatch. An adapter or Device error fails it. A confirmation deadline after dispatch produces an unconfirmed outcome.

The Controller does not queue one-time Commands for offline Devices. It rejects them as unavailable. Automations represent persistent behavior separately and reevaluate their conditions when a Device returns.

After checking Device availability, Core commits the Command ID and initial outcome to a bounded Command ledger before publishing to MQTT. Core updates that record when confirmation or failure arrives. A legitimate retry returns the stored outcome without dispatching the Command again.

The initial ledger record contains the intended payload, a short expiry, and `pending_dispatch`. After a restart, Core dispatches only unexpired Commands whose Devices are online. Core marks expired undispatched Commands as failed without sending them.

Canonical Commands set absolute desired values. A client translates a relative action such as toggle into an absolute value from current Device state. Nemu permits a relative Command only when its protocol can deduplicate the operation with the Command ID.
