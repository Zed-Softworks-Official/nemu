# Nemu

Nemu manages smart homes through a controller in each home and cloud services for access outside the home network.

## Language

**Home**:
A smart-home environment managed by one Controller. One Account can access multiple Homes.

**Home timezone**:
The IANA timezone that defines a Home's calendar days and months. Historical buckets retain the Home timezone under which Nemu created them.

**Controller**:
The Nemu installation that manages one Home.

**Private alpha**:
The current product stage, in which access remains limited by a waitlist while Nemu completes the published beta requirements.

**Public beta**:
The product stage that begins when every beta requirement passes its acceptance checks and Nemu removes the waitlist.

**Controller identity**:
The cryptographic identity that a Controller creates and holds locally to prove which Home it represents.

**Controller instance**:
One active installation running under a Controller identity. Restoring a Home retires the previous Controller instance and creates a new one.

**Identity epoch**:
A generation number that identifies the active Controller instance for a Home.

**Account**:
A person's Nemu identity. An Account can have Memberships in multiple Homes.

**Membership**:
The relationship between one Account and one Home. A Membership has the Owner or Member role.

**Owner**:
The Membership role that can manage Devices, access, networking, updates, backups, and Relay configuration for a Home. All Owners are peers, and a Home must retain at least one Owner.

**Member**:
The Membership role that can commission, control, and remove Devices but cannot administer the Home or its access. A Member can revoke their own Access Clients or leave the Home.

**Access Client**:
An authorized browser profile or native app installation that belongs to one Membership. Each Access Client is authorized and revoked separately.

**Access Client tombstone**:
The retained identity and public keys of a revoked Access Client. A tombstone prevents the old identity from receiving a new authorization.

**Access grant**:
A Controller-signed authorization that binds an Access Client's public keys to one Membership. The grant remains valid until the Controller revokes it.

**Invitation**:
An Owner's request to add an Account to a Home. An Invitation identifies the Account but grants no access until the Account accepts it from the Home network.

**Recovery Key**:
An offline secret that can authorize a new Owner Access Client when used from the Home network. It also protects the encryption key for Home backups through a separate cryptographic derivation.

**Home backup**:
An encrypted archive containing the local identity, local data including retained History, adapter state, configuration, and release information needed to recreate the same Home. Initial releases store or export Home backups locally; later releases may store the opaque encrypted archive in Convex after an Owner opts in.

**Room**:
A named physical area in a Home. A Device belongs to one Room, and its Components inherit that Room unless assigned to another Room.

**Device**:
An IoT unit that a Home can observe or control through Nemu. A phone, laptop, or other computer used to open the dashboard is not a Device.

**Device tombstone**:
The retained identity and metadata of a removed Device. A tombstone can restore history and metadata after a trustworthy protocol identity returns, but it is not an active Device.

**Component**:
An independently addressable part of a Device, such as one outlet in a power strip. Capabilities can belong to either a Device or a Component.

**Capability**:
A protocol-independent kind of state or control that a Device supports. Each Capability has a stable identity, kind, value type, unit, access rules, constraints, physical scope, and optional Component.

**Capability observation**:
An immutable value report for one Capability with distinct observation and receipt times. Its identity and observation time remain stable across retries and retained replay.

**Gauge Capability**:
A numeric Capability whose value describes a condition at one observation time and may rise or fall. Power, voltage, and current are Gauge Capabilities.

**Energy counter**:
A cumulative imported-energy or exported-energy Capability. Its value is nonnegative and remains monotonic within one Meter epoch.

**Scope total**:
A direct Capability that measures an entire Home, Device, or Component. Core never creates a Scope total by adding child Components; ambiguous direct Capabilities remain separate series.

**Device type**:
A presentation category that selects an icon and default layout for a Device. Device type does not determine controls or behavior.

**Device state**:
The current typed values and availability of a Device's Capabilities. Each snapshot has a State epoch and revision.

**State epoch**:
An identifier for one in-memory Device-state lifetime. Clients discard cached state when Core rebuilds state under a new State epoch.

**Capability availability**:
The period during which one Capability has a current, usable value. It is independent of whether other Capabilities on the same Device are available.

**Trustworthy time**:
A Controller clock state accurate enough to validate observation times and run scheduled Automations.

**Command**:
A request to set one or more Device Capability values. Canonical Commands express absolute desired values.

**Command outcome**:
The result of a Command. `accepted` is transitional, while `confirmed`, `rejected`, `failed`, and `unconfirmed` are final outcomes.

**Command ledger**:
A bounded record of Command IDs and outcomes used to prevent duplicate dispatch and answer retries.

**Capability manifest**:
A description of the Capability identities, constraints, contract versions, and operations shared by Core and a Protocol adapter.

**Protocol adapter**:
An isolated Controller process that integrates one IoT protocol or device API and translates it to and from Nemu's canonical model. Matter, Zigbee, and individual Wi-Fi integrations use Protocol adapters; Wi-Fi alone is not a device protocol.

**Wi-Fi integration**:
A first-party driver for a specific local device API or device family within the Wi-Fi Protocol adapter. The initial compatibility list contains Elgato Key Light and Key Light Air. Nemu does not support third-party or user-installed adapter plugins.

**Automation**:
A Controller-local rule with triggers, conditions, and actions over canonical Capabilities. Core persists and evaluates Automations and executes their actions through the same Command path used for direct control.

**History**:
Normalized Capability observations and derived rollups stored on the Controller under retention, downsampling, and disk-budget rules.

**History rollup**:
A time-bounded summary of Capability observations that preserves the measurements, coverage, Meter epochs, and gaps required by that Capability kind.

**History budget**:
The maximum Controller storage allocated to History. A separate free-space floor protects Commands, updates, and normal Controller operation.

**Estimated energy**:
Energy inferred by integrating power observations rather than by comparing cumulative energy readings. Estimated import and Estimated export are separate results for bidirectional power.

**Measured energy**:
Energy calculated from nonnegative changes in cumulative energy readings within one Meter epoch. It is unknown across a History gap, unavailable period, or uncertain Capability identity.

**Imported energy**:
Nonnegative energy delivered into the measured scope. It remains distinct from consumption and Exported energy.

**Exported energy**:
Nonnegative energy delivered out of the measured scope. It is never subtracted from Imported energy unless a caller explicitly requests a future net-energy metric.

**Meter epoch**:
An uninterrupted period during which one cumulative energy meter remains monotonic. Consumption is never calculated across Meter epochs.

**Home meter**:
A designation of at least one power, imported-energy, or exported-energy Capability as authoritative for a Home's total. All selected Capabilities belong to one Device or Component and measure the same physical scope.

**Home-meter designation period**:
An immutable interval during which one Home-meter designation defines Home results. Designation periods never reinterpret earlier Capability History.

**History gap**:
A period during which History recording was lost or suspended. Source unavailability and other reasons that no usable observation existed are Missing intervals, not History gaps.

**History health**:
The Controller's current ability to admit and retain eligible Capability observations.

**History coverage**:
The share of a bucket's actual elapsed duration covered by usable observations. Missing intervals and History gaps reduce coverage rather than count as zero.

**Missing interval**:
A period with no usable result because the source was unavailable or stale, no Home meter was designated, or a Meter-epoch or designation boundary prevented calculation.

**History availability**:
The retained portion of one History series that can still be queried. Its `availableSince` can move forward even though its permanent `recordingSince` does not change.

**History query snapshot**:
A complete History query result fixed to one `asOf` instant and one consistent version of retained data. Pagination does not change either.

**Capability freshness**:
The period after a Capability observation during which the value remains current enough for live display and derived results.

**History eligibility**:
Whether a Capability has the identity, constraints, and time metadata required for its observations to enter History. A History-ineligible Capability can still have a current value.

**Unattributed remainder**:
The portion of a Home-meter result not explained by an aligned, non-overlapping Contributor set. It exists only when the participating meters provide enough coverage and accuracy metadata.

**Contributor set**:
A collection of aligned meter results whose physical scopes are known not to overlap. A parent meter and its child meters cannot belong to the same Contributor set.

**Diagnostic log**:
A bounded Controller-local record of raw protocol payloads used for troubleshooting. It is not History or Product analytics.

**Relay**:
The short-lived cloud path used when the dashboard cannot reach a Controller over the home network. Relay envelopes are encrypted end to end and contain no durable home model or history.

**Release channel**:
The update stream assigned to a Home. Stable is the default; an Owner can move a Home to Canary.

**Product analytics**:
Optional, cloud-bound usage and error reporting. Product analytics are disabled by default and require an explicit choice during setup.

**Controller health metrics**:
Controller-local operational readings such as CPU temperature, memory and disk use, database size, History budget, and service health. They support maintenance and updates and are distinct from Product analytics.

**Audit log**:
An Owner-only, Controller-local record of security and administrative changes. Audit records follow explicit retention rules and are not Product analytics.

**Support bundle**:
An Owner-exported archive of Controller health and redacted local logs used for troubleshooting. It contains no private keys, credentials, Device identifiers, Commands, or Device state and is never uploaded automatically.
