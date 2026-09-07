# Limit cloud persistence to identity and routing

Convex may persist identity, Membership routing projections, Controller public identity, invitations, and ACME records. It may later store an opaque encrypted Home backup after an Owner explicitly enables cloud backup, but Convex never receives the backup key and does not expose the archive as a Home model or History. Relay envelopes and their traffic metadata expire quickly. Cloud logs exclude envelope contents, Device identifiers, Commands, and Device state.
