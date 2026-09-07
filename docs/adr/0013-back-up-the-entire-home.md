# Back up the entire Home

An encrypted Home backup includes PostgreSQL, Controller identity, TLS material, adapter stores, configuration, and a release manifest. Restoring the backup on replacement hardware recreates the same Home and Controller identity. Without a Home backup, the user creates a new Home and recommissions Devices.

The initial backup release exports the encrypted archive to an Owner-selected machine or drive rather than relying on the Controller disk being recovered. A later release may let an Owner opt into durable cloud storage of the encrypted archive in Convex. Convex never receives the Recovery Key or derived backup key and cannot decrypt the archive.

The Recovery Key wraps the Home backup encryption key through a derivation separate from Access Client recovery. Owners store the Recovery Key separately from Home backups. Replacement-hardware restore is impossible if every Owner Access Client and the Recovery Key are both lost.

To create a consistent Home backup, the Controller enters a short maintenance mode, stops new Commands, quiesces adapters, snapshots every store, writes and verifies the release manifest, then resumes operation. A failed backup leaves the running Home unchanged.

Restoring a Home transfers it to a new Controller instance. The restored Controller increments the identity epoch and registers it with Convex, which rejects the retired instance. The Owner must confirm that the previous Controller instance is retired.
