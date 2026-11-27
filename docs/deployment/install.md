# Install Nemu on Ubuntu Server

Nemu’s controller runs as a Docker Compose stack on hardware you own, kept current by the host **Updater**. The supported host OS is **Ubuntu Server LTS** (22.04 or 24.04) on **amd64** or **arm64** (including Raspberry Pi 4/5 with Ubuntu Server). The installer requires systemd.

## One-liner

No env vars are required for Nemu cloud. The installer bakes the production Convex site URL and a **public shared** registration secret (anyone who can download the script can register a controller to that deployment — intentional for consumer installs).

```bash
curl -fsSL https://get.nemu.sh | sudo sh
```

That installs the newest **Stable** Release. To start a new Home on **Canary** instead:

```bash
curl -fsSL https://get.nemu.sh | sudo NEMU_CHANNEL=canary sh
```

The installer refuses with a clear message when the chosen channel has no published Release, or when that Release predates the host Updater. Nothing on the host changes in either case.

Inspect the script before running:

```bash
curl -fsSL https://get.nemu.sh
```

### Optional overrides

`sudo` resets the environment, so installer variables must be passed to `sh`, not `curl`. Use these for a custom/self-hosted Convex deployment or a different controller name:

```bash
curl -fsSL https://get.nemu.sh | sudo \
  NEMU_CONVEX_SITE_URL=https://YOUR_DEPLOYMENT.convex.site \
  CONTROLLER_REGISTRATION_SECRET=your_secret \
  NEMU_CONTROLLER_NAME=Home \
  sh
```

`CONVEX_URL` (the Convex client URL) is accepted as an alias; `*.convex.cloud` is rewritten to `*.convex.site`. Flags also work, and survive `sudo` even when env vars do not:

```bash
curl -fsSL https://get.nemu.sh | sudo sh -s -- \
  --force \
  --convex-url=https://YOUR_DEPLOYMENT.convex.cloud \
  --registration-secret=your_secret \
  --controller-name=Home
```

| Variable / flag                                            | Purpose                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `NEMU_CONVEX_SITE_URL` / `--convex-url`                    | Override Convex HTTP site URL (default: Nemu prod); relay derives `.convex.cloud` |
| `CONVEX_URL`                                               | Alias for the Convex deployment URL (`.cloud` → `.site`)           |
| `NEMU_CONTROLLER_NAME` / `--controller-name`               | Display name (default `Home`)                                      |
| `CONTROLLER_REGISTRATION_SECRET` / `--registration-secret` | Override shared secret with cloud (default: public Nemu prod value) |
| `NEMU_ZIGBEE_DEVICE` / `--zigbee-device`                   | Host serial path (default auto: `/dev/ttyACM0`, `/dev/ttyUSB0`, …) |
| `NEMU_CHANNEL` / `--channel`                               | Release channel for a new Home: `stable` (default) or `canary`. An existing Home keeps its channel |
| `NEMU_FORCE=1` / `--force`                                 | Re-run on an existing `/opt/nemu` (keeps `.env`, Home data, and the Release) |

## What gets installed

Under `/opt/nemu`:

- `docker-compose.yml` and `mosquitto/mosquitto.conf` — stack files from the signed Release. Every image is pinned by digest: mosquitto, zigbee2mqtt, `nemu-matter`, postgres, `nemu-core`
- `.env` — Postgres password and Convex settings
- `zigbee2mqtt/configuration.yaml` — seeded on first install, then left alone
- `docker-compose.override.yml` — USB serial mapping when an adapter is detected. A re-run keeps it when no adapter is attached at that moment
- `volumes/postgres`, `volumes/matter`, `mosquitto/data` — Home data, as bind mounts so the Updater can snapshot them
- `updater/` — the Updater wrapper, installed Updater binaries, the pinned release-signing key, and the installed Release (`installed-release.json`)
- `run/updater.sock` — the Updater control socket

Outside `/opt/nemu`, it installs `nemu-updater.service` (systemd). Docker Engine and the Compose plugin are installed from Docker’s official Ubuntu apt repository if missing, and `jq` and `openssl` from Ubuntu’s.

Before anything from a Release runs, the installer downloads the channel manifest from `https://get.nemu.sh/releases/<channel>.json` and verifies its ed25519 signature with OpenSSL against the release key. That key is pinned in the script, or the Home's own pin on a re-run. The Updater checks it again before laying the Release down.

## Matter

Matter-over-Wi-Fi support is on by default and needs no extra hardware: the
`nemu-matter` service runs host-networked (Matter requires mDNS and IPv6),
and new devices are commissioned over the host's Bluetooth adapter. The
adapter is built on matter.js, which drives Bluetooth directly over HCI
([container requirements](matter-ble.md), not yet verified on hardware).
The installer installs and enables BlueZ when the Bluetooth service is not
already active, and warns if it still cannot start (or if IPv6 is disabled).
`nemu-matter` runs as uid 1000; the installer chowns `/opt/nemu/volumes/matter`
so the process can write its fabric store.

Pair from the dashboard: **Add device → Works with Matter**, then scan the
device's QR code or enter its 11-digit pairing code. For devices that join
Wi-Fi during setup, the wizard asks for the 2.4 GHz home network; credentials
stay on the controller. If pairing fails, put the device back in pairing
mode, keep it near the controller, and try again on 2.4 GHz — not 5 GHz.
A multi-outlet power strip appears as one smart-strip device; opening it
lets you manage each outlet. Forgetting the strip unpairs the whole device.
The only internet traffic Matter adds is DCL certificate attestation during
commissioning.

Controller API: `http://<host-ip>:6368` and `https://<host-ip>:6368` on the same port (opportunistic TLS). Pair from [https://app.nemu.sh](https://app.nemu.sh). After the controller registers, the dashboard prefers `https://{controllerId}.lan.nemu.sh:6368` with a Let's Encrypt certificate (your home LAN address is published under that hostname so the browser can trust it). Until that cert is issued, the first HTTPS visit uses a self-signed certificate — continue past the browser warning once so the dashboard can use `wss://`.

## Updates

A Home installs one **Release** at a time from its **Release channel**. A Release is a signed manifest naming the Platform version, the digest of every service image, the stack files, and the Updater binary. Moving the `:latest` or `:canary` image tags does not update a Home.

The Updater runs on the host as `nemu-updater.service`, outside the compose stack. systemd starts the Updater wrapper, which runs the installed Updater binary as a daemon. If that binary fails its startup check or exits three times within a minute, the wrapper starts the previous one. The daemon:

- checks the Home's channel every hour and installs a newer Release on its own;
- answers Owner requests from dashboard Settings (status, install now, roll back, switch channel) on the Unix socket `/opt/nemu/run/updater.sock`. Only `nemu-core` mounts that socket, and Core refuses Members. There is no TCP port or token.

An install enters maintenance mode, snapshots Home data, replaces stack files, recreates only the services whose digest or mounted files changed, and waits for Core to stay healthy. If the health gate fails, the Home returns to the previous Release as a whole. An Owner can roll back the last Release once while its snapshot is kept. Switching to a channel with an older Release saves the choice and installs nothing until that channel publishes something newer.

```bash
systemctl status nemu-updater
journalctl -u nemu-updater -f
```

Zigbee devices stay on the radio across an install; Core rebuilds live state from MQTT. The installer adds `availability: enabled: true` to the Zigbee configuration if it is missing, so mains-powered devices are pinged after Core restarts.

### Moving an existing Home off Watchtower

Homes installed before the Updater run Watchtower, which only follows `nemu-core:latest`. Re-run the installer to move one onto the Updater:

```bash
curl -fsSL https://get.nemu.sh | sudo NEMU_FORCE=1 sh
```

That stops the old stack and installs the Updater and `nemu-updater.service`. It installs the channel's signed Release (Stable unless `NEMU_CHANNEL` is set), removes the Watchtower service and every `WATCHTOWER_*` setting, and starts the stack again. `.env` and the Zigbee serial override are kept. Postgres, Mosquitto, and Matter data move from Docker named volumes to the bind mounts above. The installer copies each volume once, into an empty directory, with the stack stopped. The old volumes are left in place; once the Home is healthy you can remove them:

```bash
sudo docker volume rm nemu_postgres-data nemu_mosquitto-data nemu_matter-controller-data
```

A re-run on a Home that is already on a Release refreshes the wrapper, `.env`, and the service. It does not change the Release or the channel. Switch channel in dashboard Settings.

## Publishing a Release (maintainers)

This is how Homes receive updates. A Home runs the Updater binary from its own Release, so the first Release that carries a given Updater change has to be installed by the previous Updater, or by the installer.

A push to `canary` whose `platform/` or `infra/prod/` differs from the newest Release candidate or promoted Release publishes the next Release candidate, such as `0.1.4-canary.1`. The workflow builds the Nemu images, freezes every service image at a digest, signs the Canary manifest, tags those images with the Platform version and `:canary`, and tags the commit `v0.MINOR.PATCH-canary.N`. Its GitHub release is a pre-release. A dashboard-only, marketing-only, or Convex-only push skips the publish. Vercel and Convex deploy on their own.

N counts up within one target, which is the next patch after the newest plain version unless a candidate already chose a higher one. All of the following run from **Actions → Publish Release**:

| Action | Branch | Inputs |
| --- | --- | --- |
| Cut a candidate although the trees did not change (for example a third-party digest refresh), on a commit without one | `canary` | channel `canary` |
| Start the next minor target | `canary` | channel `canary`, minor bump |
| Start the next patch target | `canary` | channel `canary`, advance version |
| Promote a candidate | `master` | channel `stable`, candidate `0.1.4-canary.3` |
| Publish a Hotfix Release | `master` | channel `stable`, hotfix |

**Minor bump.** It is explicit: the checkbox, or this line in the message of the pushed commit. It holds while cuts stay on that minor target, so repeating it there changes nothing. Advancing starts a new target, so a minor bump after it selects the next minor.

```text
Bump-Platform-Minor: true
```

**Advance.** Only the newest candidate for a target can be promoted. Advance before newer work lands to keep the current one promotable: cuts then continue on the next target. A commit carries at most one candidate and one Stable Release, so advance from a `canary` commit that has no candidate yet, for example one that changes only documentation. On a commit whose unfinished candidate was not an advance, the run is refused: finish that candidate without the option first. Combined with a minor bump, it starts the next minor target.

**Promote.** Rebase-merge the `canary` → `master` PR, then promote. The run is refused unless the candidate exists, its platform trees match `master`, it is the newest candidate for its target, and its plain version is unused and newer than Stable. Nothing is rebuilt: the plain Release has the candidate's digests, stack files, and Updater binaries, and its tag is on the candidate's commit. It moves Stable and `:latest`, and also Canary and `:canary` unless Canary is already newer.

**Hotfix.** For an urgent fix when Canary is not ready. It builds `master` as the next plain patch, moves Stable only, and opens a sync PR into `canary`. Merge that PR. Opening it needs **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, which the organization can also disallow. Without it the run still succeeds, with a warning and a link in its summary for opening the PR from the pushed `sync/stable-<version>-to-canary` branch by hand. Candidates for the version it took can no longer be promoted, and the next cut moves past it. Homes running a candidate do not install it. Any other Stable run is refused, so Stable never gets an untested build by accident.

**Retry.** Re-run the workflow run, or start it again with the same inputs on the same commit. It finishes the same version at whatever step was interrupted and never moves a channel backwards. Once Canary serves the candidate, only a re-run is accepted: starting a new Canary run on that commit is refused, because it would be a second candidate. If an interrupted advance cannot be told from a normal first cut, its retry is refused too; finish it without advance version. A draft GitHub release is not a Release; the retry replaces it. Re-running an old run that never published is refused once a later Release contains its commit. A refused request leaves every channel and tag unchanged.

Postgres, Mosquitto, and Zigbee2MQTT are pinned by digest. They do not receive `:canary` or `:latest`. Homes install the signed manifest.

Each `v0.*` GitHub release carries its own immutable `release-manifest.json`. The channel manifests are mutable pointers, so they are served from the install host instead: `https://get.nemu.sh/releases/canary.json` and `https://get.nemu.sh/releases/stable.json`. The workflow writes them to the `nemu-release-channels` Vercel Blob store on the `nemu-web` project, with a 60-second cache, so a promotion shows up within a few minutes. The host is not trusted. The installer and Updater verify the signature against the pinned release key, and the Updater refuses a Platform version older than the installed one.

`core-v*` and `matter-v*` do not publish a platform Release.

The private release-signing key is the `NEMU_RELEASE_SIGNING_KEY` repository secret. The Blob write token is the `NEMU_RELEASE_CHANNELS_BLOB_TOKEN` repository secret.

See [`.github/workflows/publish-release.yml`](../../.github/workflows/publish-release.yml).

### First activation

The Publisher change itself is a `platform/` change, so merging it into `canary` publishes `0.1.4-canary.1`. Updaters at 0.1.2 and older treat candidates as not newer and reject a Hotfix Release's manifest. Before merging it:

1. Cut the bridge Release, 0.1.3, under the previous scheme and publish it on Stable. Do not merge `platform/` or `infra/prod/` changes into `canary` between the two.
2. Confirm every Home runs 0.1.3: check the Platform version in each Home's dashboard Settings. There is no telemetry. A Canary Home that missed it can switch to Stable, install 0.1.3, and switch back while Stable serves it. Re-running the installer does not replace an existing Home's Updater.
3. Merge. Do not run **Publish Release** on `master` until the change reaches `master`, because the workflow there still uses the previous scheme.

Security controls: [github-release-protections.md](github-release-protections.md).

## Related

- [Subdomain cutover](subdomain-cutover.md)
- [GitHub release protections](github-release-protections.md)
- [Architecture overview](../architecture/overview.md)
