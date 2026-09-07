# Keep Controller private keys local

The Controller generates its identity locally and registers only its public key with Convex. Convex authenticates the Controller through a signed challenge instead of a shared registration secret. Claiming a new Home requires proof from verified local pairing. First-Owner setup will use a LAN-local commissioning experience patterned after Matter commissioning; its exact interaction is deferred until implementation planning.

The Controller also generates its LAN TLS private key locally. Convex may coordinate DNS validation and return a certificate for a certificate signing request, but the private key never leaves the Controller.
