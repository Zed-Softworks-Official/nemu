# Run the Updater as a systemd service behind a Unix socket

The Updater (ADR-0028) runs on the Controller host as `nemu-updater.service`. systemd starts the Updater wrapper, and the wrapper runs the installed Updater binary as a long-lived daemon. If that binary fails its startup check or crash-loops, the wrapper starts the previous binary. The daemon runs the hourly Release check and listens on a Unix socket under the Controller directory (`/opt/nemu/run/updater.sock`). Only `nemu-core` bind-mounts that socket. Owner status, install, rollback, and Release channel requests reach the Updater through Core over LAN or Relay. Members cannot make them.

## Considered options

An hourly systemd timer with a separate socket-activated unit would avoid a long-lived process, but install, rollback, and the health gate would then be split across units that each need to reconstruct state. A loopback HTTP listener with a shared token, like the Watchtower API it replaces, adds a network port and a secret in `.env`. With a socket, file ownership is enough to control access.

## Consequences

The installer requires systemd, which every supported platform in ADR-0010 provides. A fresh install, or a re-run on an existing Home, installs the Updater, the wrapper, and the pinned release-signing key. It then has the Updater install the Home's Release channel manifest by digest before the stack starts, so a Home is on a Release from its first boot. A re-run removes the Watchtower service and its settings. Stable is the default Release channel; the installer refuses with a clear message when the selected channel has no published manifest.
