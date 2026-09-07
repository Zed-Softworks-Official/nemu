# Keep Membership authority on the Controller

The Controller's PostgreSQL records determine Membership and access to a Home. Convex holds only a routing projection. The Controller signs Membership changes and publishes them through a retryable outbox. The Controller never grants access from an unsigned cloud identity claim.
