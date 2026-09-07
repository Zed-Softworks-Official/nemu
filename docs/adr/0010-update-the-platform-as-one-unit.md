# Update the platform as one unit

A Nemu updater will coordinate complete, versioned releases across the whole Controller platform. Stable is the default release channel, and Owners may opt a Home into Canary. Every release uses health validation and automatic rollback. Watchtower remains an incomplete interim mechanism because it does not update every service or coordinate their versions; the updater's detailed implementation remains deferred.

Public beta support covers the advertised Ubuntu 22.04 and 24.04 combinations on amd64, Raspberry Pi 4, and Raspberry Pi 5. Each advertised combination must pass installation, update, rollback, backup, restore, Matter, and Zigbee checks. Public-beta and later releases preserve Home identity and supported data through forward migrations and compatible restore paths.

Removing the beta waitlist also requires more than completing feature checkboxes. Nemu must have no known critical security defects and must pass its internet-outage, backup-and-restore, update-rollback, schema-migration, and complete supported-platform checks.
