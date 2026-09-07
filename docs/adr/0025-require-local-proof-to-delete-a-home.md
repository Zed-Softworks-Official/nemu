# Require local proof to delete a Home

Deleting a Home requires LAN access, recent Owner authentication, and explicit confirmation. The Controller attempts protocol-aware Device decommissioning, deletes its local Home data, and removes the Home's Convex routing projection and encrypted cloud backups. If a Device is offline, Nemu warns that it may retain protocol credentials but does not make the Home undeletable. This prevents a compromised cloud session from remotely destroying the authoritative Home.
