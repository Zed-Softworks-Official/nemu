# Return explicit protocol incompatibility errors

Requests use a stable outer envelope with a request ID and protocol version. A Controller returns `unsupported_action` or `protocol_mismatch` when it cannot perform a request and includes the required Controller version when known. Clients use the Controller's Capability manifest to hide unsupported actions, but the Controller response remains authoritative.
