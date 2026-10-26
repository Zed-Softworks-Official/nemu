# Install Releases with a host Updater

A Home installs one Release at a time from its Release channel. The Updater is a host process outside the compose stack, supervised by a small wrapper that can start the previous Updater binary. It replaces Watchtower. A signed Release manifest names one Platform version, the digest of every service image, the stack files, and the Updater binary for each supported architecture. The Home installs those digests. Moving image tags do not install a Release.

## Considered options

Watchtower, running inside compose and following floating tags, cannot replace stack files, pin third-party images to the same Release, or roll a Home back. An Updater that lived in the compose project would be rewriting the project that contains it, and a bad Updater image would take rollback with it. Trusting unsigned downloads from the install host would let whoever can publish that host change every Home.

## Consequences

Stack files may be replaced. Home data may not, including the stored Release channel and installed Platform version. Nemu-owned settings change only through explicit migrations, and the Rollback snapshot restores them. The Updater enters maintenance mode, snapshots Home data, and refuses the Release when the snapshot cannot be taken. Maintenance lasts through the health gate. The new binary is installed only after the gate passes. Rollback returns the previous Release as a whole, including the previous binary. One snapshot is kept. A failed rollback stays in maintenance and retries.

Platform versions are semver with the major held at 0, and the channel is not part of the version. The `canary` branch publishes the next patch on each push. Stable is an explicit publish of `master`. An already-cut Release may be published from `master` by pointing the Stable manifest at that Platform version and moving `:latest`, without allocating a second version. A `master` commit that has not been published is cut as the next Platform version and merged back to `canary`. A channel change installs a Release only when its Platform version is newer. `:canary` and `:latest` are pointers for humans and CI. Third-party images are pinned by digest and do not receive those tags.

The wrapper pins the release-signing key. Manifests are served from the install host; image blobs stay in the container registry. A key change is a Release signed by the current key. Owners install, switch channel, and roll back through the Controller, including over Relay. Members cannot. Existing Homes receive the Updater by re-running the installer.
