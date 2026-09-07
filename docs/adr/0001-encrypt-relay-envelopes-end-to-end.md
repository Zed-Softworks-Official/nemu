# Encrypt relay envelopes end to end

Convex may hold short-lived Relay envelopes when an Access Client cannot reach a Controller over the home network. The Access Client and the Controller encrypt and decrypt the envelope content end to end, so Convex cannot read Commands, Device state, or authorization material. Convex stores no durable readable Home model or History.

Each Access Client creates its cryptographic keys during verified local pairing. The Controller issues a signed grant that binds the Access Client's public keys to its Membership. The Access Client signs Relay requests and encrypts them to the Controller. The Controller signs responses and encrypts them to the Access Client. Bearer tokens never enter Relay envelopes.

Web clients generate non-exportable keys with Web Crypto. Mobile clients use the operating system's secure key store. Private keys never synchronize through the cloud. Access grants remain valid offline until revoked, and loss of the private keys requires the Access Client to pair again.

Each signed envelope includes the Home ID, Controller identity epoch, Access Client ID, request ID, monotonic counter, and expiry. The Controller rejects envelopes for a retired Controller instance, expired requests, and requests it has already processed. A legitimate retry returns the stored Command outcome instead of executing the Command again.

The public Relay applies short-lived rate limits per Home and Access Client using routing metadata. It does not inspect encrypted envelope contents to enforce those limits.

Revoking an Access Client creates a tombstone containing its ID and public keys. The Controller rejects that identity over LAN and Relay. A revoked client must create new keys and pair again.
