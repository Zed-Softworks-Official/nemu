# Number Canary Releases as candidates and promote them to Stable

Accepted, not yet shipped. Amends the Platform version and publishing rules of ADR-0028.

Canary publishes Release candidates numbered `0.MINOR.PATCH-canary.N`, with N starting at 1. Stable publishes plain Platform versions, `0.MINOR.PATCH`. Versions follow semver precedence: candidates order numerically by N and before their plain version. The major version stays at 0, and any other form is rejected. The channel is still not part of the version: a promoted Release is served on both channels.

Promotion publishes a named Release candidate's unchanged build as a Stable Release. The candidate and its promotion are two Releases with one build. The promoted manifest keeps the candidate's digests, stack files, migrations, Updater binaries, and next pin. Only its Platform version and release notes change. A Hotfix Release is a separate, explicit Stable publish of a `master` build that was not a candidate.

## Considered options

One shared counter for both channels, as in ADR-0028, uses up a Stable number on every Canary cut, and Stable publishing has to infer the build by matching trees. When Canary has moved on, that inference rebuilds older code under a higher Platform version. Promoting by moving the Stable manifest to the candidate's own version was rejected because Stable Owners would see candidate numbers. Remembering only the declined Platform version was rejected because the promotion of a rolled-back candidate has a newer version and the same failing build.

## Consequences

**Updater.** Status, the hourly check, an Owner install, and a channel switch share one eligibility rule. A manifest carries an optional signed `hotfix` field, omitted unless true, so a normal manifest keeps its existing bytes and an older Updater still reads it. A Home running a Release candidate never installs a Hotfix Release, on either channel, because it may be older code. When a Home rolls back a Release, it keeps a hash of that build: service digests, stack files, migrations, and the Updater binary for the Home's architecture. It skips any Release with a declined build, and, as before, any Release not newer than the declined version. The hashes are stored outside the Rollback snapshot and the stored Release, so they survive a restore and an older Updater. A Home with no recorded build for a declined Release skips by version only.

**Canary cuts.** A cut takes the highest target in use: the next patch after the newest plain version, or a higher target a candidate already chose. N increments within the target. A minor bump selects the next minor target once per cycle. An explicit advance option starts the next patch target. Canary compares platform trees with its newest candidate or promoted Release, not with a Hotfix Release.

**Promotion.** Promotion requires an exact candidate. It is refused unless the candidate exists, its platform trees match `master`, it is the newest candidate for its target, the plain version is unused, and the plain version is newer than Stable. It also moves the Canary manifest and image pointer unless Canary already has a higher version. One candidate and one Stable Release may share a commit; other duplicate cuts fail. A normal Stable publish never builds or allocates from an untested tree.

**Hotfix.** A Hotfix Release builds `master`, takes the next plain patch, moves Stable only, and opens the sync PR into `canary`. Canary then moves past that version, and candidates for it can no longer be promoted.

**Tags and notes.** The commit that was built is tagged, and candidate GitHub releases are pre-releases. Tags are selected in Platform version order, because Git's default version sort places candidates after their plain version. GitHub releases always include notes generated from Git history. Manifest notes remain opt-in.

**Rollout.** The Updater rule ships first, as a plain Release on both channels, under the existing publishing scheme. An older Updater treats candidates as not newer and rejects a manifest with `hotfix`. The Publisher change waits until every Home runs the bridge Release. Promotion restarts a Canary Home for an identical build, and its Rollback snapshot then precedes that same build. That cost is accepted.
