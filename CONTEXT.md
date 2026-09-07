# Nemu

Nemu manages smart homes through a controller in each home and cloud services for access outside the home network.

## Language

**Home**:
A smart-home environment managed by one Controller. One Account can access multiple Homes.

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
An encrypted archive containing the local identity, data, adapter state, configuration, and release information needed to recreate the same Home. Initial releases store or export Home backups locally; later releases may store the opaque encrypted archive in Convex after an Owner opts in.

**Room**:
A named physical area in a Home. A Device belongs to one Room, and its Components inherit that Room unless assigned to another Room.

**Device**:
An IoT unit that a Home can observe or control through Nemu. A phone, laptop, or other computer used to open the dashboard is not a Device.

**Device tombstone**:
The retained identity and metadata of a removed Device. A tombstone can restore history and metadata after a trustworthy protocol identity returns, but it is not an active Device.

**Component**:
An independently addressable part of a Device, such as one outlet in a power strip. Capabilities can belong to either a Device or a Component.

**Capability**:
A protocol-independent kind of state or control that a Device supports. Each Capability instance has a stable ID, kind, value type, unit, access rules, constraints, and optional Component.

**Device type**:
A presentation category that selects an icon and default layout for a Device. Device type does not determine controls or behavior.

**Device state**:
The current typed values and availability of a Device's Capabilities. Each snapshot has a revision and observation time.

**State epoch**:
An identifier for one in-memory Device-state lifetime. Clients discard cached state when Core rebuilds state under a new State epoch.

**Command**:
A request to set one or more Device Capability values. Canonical Commands express absolute desired values.

**Command outcome**:
The result of a Command. `accepted` is transitional, while `confirmed`, `rejected`, `failed`, and `unconfirmed` are final outcomes.

**Command ledger**:
A bounded record of Command IDs and outcomes used to prevent duplicate dispatch and answer retries.

**Capability manifest**:
A Controller description of the protocol versions and operations it supports.

**Protocol adapter**:
An isolated Controller process that integrates one IoT protocol or device API and translates it to and from Nemu's canonical model. Matter, Zigbee, and individual Wi-Fi integrations use Protocol adapters; Wi-Fi alone is not a device protocol.

**Wi-Fi integration**:
A first-party driver for a specific local device API or device family within the Wi-Fi Protocol adapter. The initial compatibility list contains Elgato Key Light and Key Light Air. Nemu does not support third-party or user-installed adapter plugins.

**Automation**:
A Controller-local rule with triggers, conditions, and actions over canonical Capabilities. Core persists and evaluates Automations and executes their actions through the same Command path used for direct control.

**History**:
Normalized past Capability values stored on the Controller under retention, downsampling, and disk-budget rules.

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
