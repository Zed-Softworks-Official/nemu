# Report Controller errors to PostHog

Status: accepted, not yet implemented. Supersedes the Sentry part of ADR-0022; the rest of ADR-0022 stands.

Controller Error reporting uses PostHog instead of Sentry, so the web and mobile clients and the Controller share one vendor, one dashboard, and one data-processing agreement. Error reporting is compiled into every Release and stays off at runtime until an Owner consents for the Home. It uses its own PostHog project and key, and a Home-level pseudonymous identifier that never appears in client events, so Controller reports can't be joined to a person's Access Client.

## Considered options

- **Sentry, as ADR-0022 planned.** Its Rust SDK already includes a `tracing` integration and panic capture. We rejected it to avoid running a second vendor just for the Controller.

## Consequences

PostHog's Rust support doesn't capture exceptions from `tracing` events or panics. Nemu owns a small `tracing` layer and panic hook that send `$exception` events. Consent checks, allowlists and scrubbing all happen in that layer. Only the Core binary depends on it; library crates emit `tracing` events and know nothing about Error reporting.
