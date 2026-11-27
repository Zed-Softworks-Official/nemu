import {
    type AccessClient,
    ApiError,
    type ApplyUpdateResponse,
    type AssignRoomRequest,
    accessClientSchema,
    applyUpdateResponseSchema,
    assignRoomRequestSchema,
    type CommandResult,
    type CommissionResponse,
    type CreateRoomRequest,
    createRoomRequestSchema,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    deviceEventSchema,
    type HealthSummary,
    type HistoryQuery,
    type HistoryQueryRead,
    type HomeMeterDesignation,
    type HomeMeterDesignationSelection,
    type HouseholdMember,
    healthSummarySchema,
    historyQueryReadSchema,
    homeMeterDesignationResultSchema,
    householdMemberSchema,
    MEMBERSHIP_ENDED_ERROR_CODE,
    type PatchDeviceRequest,
    type PatchRoomRequest,
    type PermitJoinResponse,
    pairAgainReasonSchema,
    parseDeviceList,
    patchRoomRequestSchema,
    permitJoinRequestSchema,
    permitJoinResponseSchema,
    type RelayReplyMessage,
    type RelayRequestMessage,
    type ReleaseChannel,
    type RenameDeviceRequest,
    type RenameRoomRequest,
    type Room,
    relayReplyMessageSchema,
    relayRequestMessageSchema,
    renameDeviceRequestSchema,
    renameRoomRequestSchema,
    type SessionResponse,
    type SwitchReleaseChannelResponse,
    sessionResponseSchema,
    switchReleaseChannelResponseSchema,
    type UpdateStatusResponse,
    updateStatusResponseSchema,
} from '@nemu/protocol'
import {
    EMPTY_REPLAY_WINDOW,
    openPush,
    openResponse,
    RelayCryptoError,
    type ReplayWindow,
    type RequestHeader,
    type RequestKeys,
    type SealedPush,
    type SealedRequest,
    type SealedResponse,
    sealedPushSchema,
    sealedResponseSchema,
    sealRequest,
    utf8Decode,
    utf8Encode,
} from '@nemu/protocol/relay-crypto'
import type { ConvexReactClient } from 'convex/react'
import type { FunctionReference } from 'convex/server'
import { z } from 'zod'
import {
    type AccessClientKeyStore,
    type AccessClientRecord,
    keysRefused,
    SignedRefusal,
} from '../access-client-keys.ts'
import { NOT_PAIRED_ERROR_CODE } from '../local-session.ts'
import { createWebRelayCounter, type RelayCounter } from '../relay-counter.ts'
import {
    epochFromProjection,
    readMembershipProjection,
} from './membership-projection.ts'
import {
    acknowledgeRelayResponses,
    type RelayAcknowledgeRef,
} from './relay-acknowledge.ts'
import type { ControllerTransport } from './types.ts'

/**
 * A response or push in the mailbox, as `relay:responses` returns it. Its
 * `kind` shares the mailbox's validator, so the type allows `request`.
 */
type RelayToClientDoc = {
    _id: string
    kind: 'request' | 'response' | 'push'
    sealed: SealedResponse | SealedPush
}

/** The Convex Relay functions (NEM-128): sealed envelopes only. */
export type RelayApi = {
    // Return type is intentionally loose so generated Convex Id<"relayMessages">
    // (and similar) assign without casts at the app boundary.
    send: FunctionReference<
        'mutation',
        'public',
        { sealed: SealedRequest },
        unknown
    >
    responses: FunctionReference<
        'query',
        'public',
        { controllerId: string; accessClientId: string; requestIds: string[] },
        RelayToClientDoc[]
    >
    acknowledge: RelayAcknowledgeRef
    /**
     * The caller's signed Membership routing projection (NEM-133). Never
     * trusted as returned: the transport verifies it against the pinned
     * Controller key.
     */
    membership: FunctionReference<
        'query',
        'public',
        { controllerId: string; membershipId: string },
        unknown
    >
}

/** A reply, opened and checked against the pinned Controller key. */
type RelayReply = { requestId: string; message: RelayReplyMessage }

/** A request's final attempt: its header and exported keys, and the reply. */
type RelayExchange = {
    reply: RelayReply
    header: RequestHeader
    keys: RequestKeys
    controllerSigningKey: Uint8Array
}

/**
 * A capability watch the Controller holds for this transport: the
 * registering request's header and keys, and the pushes applied so far.
 */
type LiveWatch = {
    header: RequestHeader
    keys: RequestKeys
    controllerSigningKey: Uint8Array
    window: ReplayWindow
}

/**
 * Watches polled at once: the current one, and the one it renewed, whose
 * pushes sealed before the renewal may still be in the mailbox.
 */
const POLLED_WATCHES = 2

export type RelayTransportOptions = {
    convex: ConvexReactClient
    api: RelayApi
    controllerId: string
    /** This Access Client's keys and the Controller keys pinned at pairing. */
    keyStore: AccessClientKeyStore
    /**
     * Where counters come from. Defaults to `createWebRelayCounter`: every
     * tab shares one sequence under a Web Lock, or memory outside a browser.
     */
    counter?: RelayCounter
    pollIntervalMs?: number
    commandTimeoutMs?: number
    /** How often the capability watch is renewed. The Controller's TTL is 45 s. */
    watchRenewalMs?: number
    /**
     * How long a read of the signed Membership routing projection stays
     * fresh before a request re-reads it. A send Convex refuses for want of
     * an active Membership always re-reads it.
     */
    membershipRefreshMs?: number
}

/** Convex refuses `relay:send` with this when the projection is not active. */
const NO_MEMBERSHIP_CODE = 'no_membership'

/** Sends of one request: a refusal that names a fix gets one more try each. */
const MAX_SEND_ATTEMPTS = 3

/**
 * Requests that change nothing. Every other request is a write, which must
 * fail while disconnected instead of being held and sent later.
 */
const RELAY_READS: ReadonlySet<RelayRequestMessage['type']> = new Set<
    RelayRequestMessage['type']
>([
    'getDevices',
    'getRooms',
    'listMembers',
    'listAccessClients',
    'getCapabilitySnapshot',
    'watchCapabilityChanges',
    'historyQuery',
    'getHomeMeterDesignation',
    'exportHistoryBackup',
    'releaseStatus',
    'getSession',
    'getHealthSummary',
])

/**
 * Relay transport talks to Convex mailbox functions with sealed envelopes
 * (ADR-0001). Every request is encrypted to the Controller key pinned at
 * pairing and signed with this Access Client's key; every reply is opened
 * and checked against the pinned Controller key. Convex sees only the clear
 * header, and no bearer token is ever sent. It has no way to send a Matter
 * pairing code or Wi-Fi credentials (ADR-0034's interim limit, until
 * NEM-98). Capability snapshots use the same messages as LAN. Live changes
 * arrive as sealed pushes on a capability watch (NEM-132): each is sealed
 * with the key exported from the watch request and a counter nonce, and
 * signed by the Controller. A push only counts when it opens with that key,
 * verifies against the pinned Controller key, and carries a counter above
 * every push already applied, so a replayed or reordered push is dropped.
 */
export class RelayTransport implements ControllerTransport {
    readonly mode = 'relay' as const

    private readonly convex: ConvexReactClient
    private readonly api: RelayApi
    private readonly controllerId: string
    private readonly keyStore: AccessClientKeyStore
    private counter: RelayCounter | null
    private readonly pollIntervalMs: number
    private readonly commandTimeoutMs: number
    private readonly listeners = new Set<(event: DeviceEvent) => void>()
    private readonly watchRenewalMs: number
    private readonly membershipRefreshMs: number
    /** When the projection was last read, in ms; never at first. */
    private membershipReadAt = Number.NEGATIVE_INFINITY
    private connected = false
    private watchTimer: ReturnType<typeof setInterval> | null = null
    private pushTimer: ReturnType<typeof setTimeout> | null = null
    /** Live watches, oldest first; at most `POLLED_WATCHES`. */
    private watches: LiveWatch[] = []

    constructor(options: RelayTransportOptions) {
        this.convex = options.convex
        this.api = options.api
        this.controllerId = options.controllerId
        this.keyStore = options.keyStore
        this.counter = options.counter ?? null
        this.pollIntervalMs = options.pollIntervalMs ?? 1_000
        this.commandTimeoutMs = options.commandTimeoutMs ?? 20_000
        this.watchRenewalMs = options.watchRenewalMs ?? 20_000
        this.membershipRefreshMs = options.membershipRefreshMs ?? 30_000
    }

    async connect(): Promise<void> {
        // Without keys for this Home there is nothing to seal with.
        const record = await this.record()
        // Address the current identity epoch from the first request. An
        // ended Membership surfaces on the first request instead.
        await this.syncMembership(record, { force: true }).catch(() => {})
        this.connected = true
        this.watchTimer = setInterval(() => {
            void this.renewCapabilityWatch().catch(() => {
                // The next renewal retries.
            })
        }, this.watchRenewalMs)
        void this.renewCapabilityWatch().catch(() => {
            // The renewal interval retries.
        })
        this.schedulePushPoll()
    }

    disconnect(): void {
        this.connected = false
        if (this.watchTimer) {
            clearInterval(this.watchTimer)
            this.watchTimer = null
        }
        if (this.pushTimer) {
            clearTimeout(this.pushTimer)
            this.pushTimer = null
        }
        this.watches = []
    }

    async requestCapabilitySnapshot(): Promise<void> {
        const parsed = await this.request({ type: 'getCapabilitySnapshot' })
        if (parsed.message.type === 'capabilitySnapshot') {
            this.emit(parsed.message)
        }
    }

    async getDevices(): Promise<Device[]> {
        const parsed = await this.request({ type: 'getDevices' })
        if (
            parsed.message.type === 'devices' ||
            parsed.message.type === 'snapshot'
        ) {
            return parseDeviceList(parsed.message.devices)
        }
        this.throwIfCommandError(parsed, 'load Devices')
        throw new Error('Unexpected relay response for getDevices')
    }

    async getRooms(): Promise<Room[]> {
        const parsed = await this.request({ type: 'getRooms' })
        if (parsed.message.type === 'rooms') {
            return parsed.message.rooms
        }
        this.throwIfCommandError(parsed, 'load Rooms')
        throw new Error('Unexpected relay response for getRooms')
    }

    /**
     * Returns the parsed series for the caller to hold. The transport does not
     * keep a copy after this promise settles.
     */
    async queryHistory(query: HistoryQuery): Promise<HistoryQueryRead> {
        const parsed = await this.request({
            type: 'historyQuery',
            ...query,
        })
        if (
            parsed.message.type === 'historyQueryResult' ||
            parsed.message.type === 'historyQueryRestart'
        ) {
            return historyQueryReadSchema.parse(parsed.message)
        }
        this.throwIfCommandError(parsed, 'query history')
        throw new Error('Unexpected relay response for historyQuery')
    }

    async getHomeMeterDesignation(): Promise<HomeMeterDesignation | null> {
        const parsed = await this.request({ type: 'getHomeMeterDesignation' })
        if (parsed.message.type === 'homeMeterDesignation') {
            return homeMeterDesignationResultSchema.parse(parsed.message)
                .designation
        }
        this.throwIfCommandError(parsed, 'read the Home meter')
        throw new Error('Unexpected relay response for getHomeMeterDesignation')
    }

    async designateHomeMeter(
        selection: HomeMeterDesignationSelection
    ): Promise<HomeMeterDesignation> {
        const parsed = await this.request({
            type: 'designateHomeMeter',
            ...selection,
        })
        if (parsed.message.type === 'homeMeterDesignation') {
            const designation = homeMeterDesignationResultSchema.parse(
                parsed.message
            ).designation
            if (!designation) {
                throw new Error('Home meter designation was not saved')
            }
            return designation
        }
        this.throwIfCommandError(parsed, 'designate the Home meter')
        throw new Error('Unexpected relay response for designateHomeMeter')
    }

    async sendCommand(cmd: DeviceCommand): Promise<CommandResult> {
        const parsed = await this.request({
            type: 'command',
            deviceId: cmd.deviceId,
            payload: cmd.payload,
        })
        if (parsed.message.type === 'commandResult') {
            return {
                requestId: parsed.requestId,
                ok: parsed.message.ok,
                outcome: parsed.message.outcome,
                error: parsed.message.error,
            }
        }
        throw new Error('Unexpected relay response for command')
    }

    async getSession(): Promise<SessionResponse> {
        const parsed = await this.request({ type: 'getSession' })
        if (parsed.message.type === 'session') {
            return sessionResponseSchema.parse({ role: parsed.message.role })
        }
        this.throwIfCommandError(parsed, "read this session's role")
        throw new Error('Unexpected relay response for getSession')
    }

    async getReleaseStatus(): Promise<UpdateStatusResponse> {
        const parsed = await this.request({ type: 'releaseStatus' })
        if (parsed.message.type === 'releaseStatus') {
            return updateStatusResponseSchema.parse(parsed.message)
        }
        this.throwIfCommandError(parsed, 'read the installed Release')
        throw new Error('Unexpected relay response for releaseStatus')
    }

    async getHealthSummary(): Promise<HealthSummary> {
        const parsed = await this.request({ type: 'getHealthSummary' })
        if (parsed.message.type === 'healthSummary') {
            const { type: _, ...summary } = parsed.message
            return healthSummarySchema.parse(summary)
        }
        this.throwIfCommandError(parsed, 'read Controller health')
        throw new Error('Unexpected relay response for getHealthSummary')
    }

    async installRelease(
        platformVersion?: string
    ): Promise<ApplyUpdateResponse> {
        const parsed = await this.request({
            type: 'installRelease',
            platformVersion,
        })
        if (parsed.message.type === 'installRelease') {
            return applyUpdateResponseSchema.parse(parsed.message)
        }
        this.throwIfCommandError(parsed, 'install the Release')
        throw new Error('Unexpected relay response for installRelease')
    }

    async rollbackRelease(): Promise<ApplyUpdateResponse> {
        const parsed = await this.request({ type: 'rollbackRelease' })
        if (parsed.message.type === 'rollbackRelease') {
            return applyUpdateResponseSchema.parse(parsed.message)
        }
        this.throwIfCommandError(parsed, 'roll back the Release')
        throw new Error('Unexpected relay response for rollbackRelease')
    }

    async switchReleaseChannel(
        channel: ReleaseChannel
    ): Promise<SwitchReleaseChannelResponse> {
        const parsed = await this.request({
            type: 'switchReleaseChannel',
            channel,
        })
        if (parsed.message.type === 'switchReleaseChannel') {
            return switchReleaseChannelResponseSchema.parse(parsed.message)
        }
        this.throwIfCommandError(parsed, 'switch the Release channel')
        throw new Error('Unexpected relay response for switchReleaseChannel')
    }

    async renameDevice(request: RenameDeviceRequest): Promise<Device> {
        return this.expectDevice(
            {
                type: 'renameDevice',
                ...renameDeviceRequestSchema.parse(request),
            },
            'rename the Device'
        )
    }

    async assignRoom(request: AssignRoomRequest): Promise<Device> {
        return this.expectDevice(
            { type: 'assignRoom', ...assignRoomRequestSchema.parse(request) },
            'assign the Room'
        )
    }

    async removeDevice(deviceId: string): Promise<void> {
        await this.expectOk(
            { type: 'removeDevice', deviceId },
            'remove the Device'
        )
    }

    async forgetDevice(deviceId: string): Promise<void> {
        await this.removeDevice(deviceId)
    }

    /** Dashboard shape: rename and Room assignment in one call. */
    async patchDevice(
        deviceId: string,
        patch: PatchDeviceRequest
    ): Promise<Device> {
        // Validate both halves first, then move the Device before renaming
        // it: the Controller checks the Room target, so a bad roomId fails
        // before anything has changed.
        const rename =
            patch.name === undefined
                ? undefined
                : renameDeviceRequestSchema.parse({
                      deviceId,
                      name: patch.name,
                  })
        let device: Device | undefined
        if (patch.roomId !== undefined) {
            device = await this.assignRoom({ deviceId, roomId: patch.roomId })
        }
        if (rename) {
            device = await this.renameDevice(rename)
        }
        if (!device) throw new Error('name or roomId is required')
        return device
    }

    async createRoom(request: CreateRoomRequest): Promise<Room> {
        return this.expectRoom(
            { type: 'createRoom', ...createRoomRequestSchema.parse(request) },
            'create the Room'
        )
    }

    async renameRoom(request: RenameRoomRequest): Promise<Room> {
        return this.expectRoom(
            { type: 'updateRoom', ...renameRoomRequestSchema.parse(request) },
            'rename the Room'
        )
    }

    async patchRoom(roomId: string, patch: PatchRoomRequest): Promise<Room> {
        return this.expectRoom(
            {
                type: 'updateRoom',
                roomId,
                ...patchRoomRequestSchema.parse(patch),
            },
            'update the Room'
        )
    }

    async deleteRoom(
        roomId: string,
        destinationRoomId: string | null
    ): Promise<void> {
        await this.expectOk(
            { type: 'deleteRoom', roomId, destinationRoomId },
            'delete the Room'
        )
    }

    async permitJoin(seconds: number): Promise<PermitJoinResponse> {
        const parsed = await this.request({
            type: 'permitJoin',
            ...permitJoinRequestSchema.parse({ seconds }),
        })
        if (parsed.message.type === 'permitJoin') {
            return permitJoinResponseSchema.parse(parsed.message)
        }
        this.throwIfCommandError(parsed, 'open the Zigbee network')
        throw new Error('Unexpected relay response for permitJoin')
    }

    async cancelMatterCommission(): Promise<CommissionResponse> {
        const parsed = await this.request({ type: 'cancelMatterCommission' })
        if (parsed.message.type === 'cancelMatterCommission') {
            return { ok: parsed.message.ok }
        }
        this.throwIfCommandError(parsed, 'cancel Matter pairing')
        throw new Error('Unexpected relay response for cancelMatterCommission')
    }

    private async expectDevice(
        message: RelayRequestMessage,
        action: string
    ): Promise<Device> {
        const parsed = await this.request(message)
        if (parsed.message.type === 'device') return parsed.message.device
        this.throwIfCommandError(parsed, action)
        throw new Error(`Unexpected relay response for ${message.type}`)
    }

    private async expectRoom(
        message: RelayRequestMessage,
        action: string
    ): Promise<Room> {
        const parsed = await this.request(message)
        if (parsed.message.type === 'room') return parsed.message.room
        this.throwIfCommandError(parsed, action)
        throw new Error(`Unexpected relay response for ${message.type}`)
    }

    private async expectOk(
        message: RelayRequestMessage,
        action: string
    ): Promise<void> {
        const parsed = await this.request(message)
        if (parsed.message.type === 'commandResult' && parsed.message.ok) return
        this.throwIfCommandError(parsed, action)
        throw new Error(`Unexpected relay response for ${message.type}`)
    }

    async getMembers(): Promise<HouseholdMember[]> {
        const parsed = await this.request({ type: 'listMembers' })
        if (parsed.message.type === 'members') {
            return parsed.message.members
        }
        this.throwIfCommandError(parsed, 'list members')
        throw new Error('Unexpected relay response for listMembers')
    }

    async inviteMember(email: string): Promise<HouseholdMember> {
        const parsed = await this.request({ type: 'inviteMember', email })
        if (parsed.message.type === 'member') {
            return householdMemberSchema.parse(parsed.message.member)
        }
        this.throwIfCommandError(parsed, 'invite member')
        throw new Error('Unexpected relay response for inviteMember')
    }

    async removeMember(memberId: string): Promise<void> {
        const parsed = await this.request({ type: 'removeMember', memberId })
        if (parsed.message.type === 'commandResult' && parsed.message.ok) {
            return
        }
        this.throwIfCommandError(parsed, 'remove member')
        throw new Error('Unexpected relay response for removeMember')
    }

    async listAccessClients(): Promise<AccessClient[]> {
        const parsed = await this.request({ type: 'listAccessClients' })
        if (parsed.message.type === 'accessClients') {
            return parsed.message.accessClients.map((client) =>
                accessClientSchema.parse(client)
            )
        }
        this.throwIfCommandError(parsed, 'list devices')
        throw new Error('Unexpected relay response for listAccessClients')
    }

    async revokeAccessClient(accessClientId: string): Promise<void> {
        const parsed = await this.request({
            type: 'revokeAccessClient',
            accessClientId,
        })
        if (parsed.message.type === 'commandResult' && parsed.message.ok) {
            return
        }
        this.throwIfCommandError(parsed, 'revoke device')
        throw new Error('Unexpected relay response for revokeAccessClient')
    }

    async revokeCurrentAccessClient(): Promise<void> {
        const parsed = await this.request({ type: 'revokeCurrent' })
        if (parsed.message.type === 'commandResult' && parsed.message.ok) {
            return
        }
        this.throwIfCommandError(parsed, 'remove this Access Client')
        throw new Error('Unexpected relay response for revokeCurrent')
    }

    async leaveHome(): Promise<void> {
        const parsed = await this.request({ type: 'leaveHome' })
        if (parsed.message.type === 'commandResult' && parsed.message.ok) {
            return
        }
        this.throwIfCommandError(parsed, 'leave the Home')
        throw new Error('Unexpected relay response for leaveHome')
    }

    private throwIfCommandError(parsed: RelayReply, action: string): void {
        if (parsed.message.type === 'commandResult' && !parsed.message.ok) {
            // Same error shape as LAN, so callers can act on the code. The
            // reply opened under this request's keys and verified against
            // the pinned Controller key, so its refusal is signed.
            throw new SignedRefusal(
                parsed.message.error?.code ?? 'relay_error',
                parsed.message.error?.message ?? `Failed to ${action}`,
                undefined,
                parsed.message.error?.details
            )
        }
    }

    private async record(): Promise<AccessClientRecord> {
        const record = await this.keyStore.load(this.controllerId)
        if (!record) {
            throw new ApiError(
                NOT_PAIRED_ERROR_CODE,
                'This device is not paired with this Home. Pair it again at home.'
            )
        }
        return record
    }

    /**
     * Reads the signed Membership routing projection and applies what it
     * says once it verifies against the pinned Controller key: a newer
     * identity epoch is saved, an ended Membership throws
     * `membership_ended`. Anything unverifiable changes nothing.
     */
    private async syncMembership(
        record: AccessClientRecord,
        { force = false }: { force?: boolean } = {}
    ): Promise<AccessClientRecord> {
        const now = Date.now()
        if (!force && now - this.membershipReadAt < this.membershipRefreshMs) {
            return record
        }
        this.membershipReadAt = now
        const { enrollment } = record
        const projection = await readMembershipProjection(
            () =>
                this.convex.query(this.api.membership, {
                    controllerId: this.controllerId,
                    membershipId: enrollment.membershipId,
                }),
            enrollment
        )
        if (!projection) return record
        if (projection.state === 'ended') {
            throw new SignedRefusal(
                MEMBERSHIP_ENDED_ERROR_CODE,
                'This Account is no longer a Member of this Home.'
            )
        }
        const updated = epochFromProjection(enrollment, projection)
        if (!updated) return record
        const next = { keys: record.keys, enrollment: updated }
        await this.keyStore.save(next)
        return next
    }

    /** Sends a sealed request, explaining a refusal for want of a Membership. */
    private async send(
        record: AccessClientRecord,
        sealed: SealedRequest,
        deadline: number
    ): Promise<void> {
        try {
            await this.settleBy(
                this.convex.mutation(this.api.send, { sealed }),
                deadline
            )
        } catch (error) {
            if (convexErrorCode(error) !== NO_MEMBERSHIP_CODE) throw error
            // Convex says this Account has no active Membership here. Only
            // the Controller's signature can say it ended.
            await this.syncMembership(record, { force: true })
            throw new ApiError(
                NO_MEMBERSHIP_CODE,
                'The Relay does not route this Account to this Home yet.'
            )
        }
    }

    private async request(message: RelayRequestMessage): Promise<RelayReply> {
        return (await this.exchange(message)).reply
    }

    /** Sends one request and returns its final attempt with the reply. */
    private async exchange(
        message: RelayRequestMessage
    ): Promise<RelayExchange> {
        const action = relayRequestMessageSchema.parse(message)
        let record = await this.syncMembership(await this.record())
        // Convex holds mutations while disconnected and sends them on
        // reconnect. A write must not happen later (ADR-0015).
        const write = !RELAY_READS.has(action.type)
        if (write && !this.convex.connectionState().isWebSocketConnected) {
            throw new ApiError(
                'relay_disconnected',
                'Not connected to the Relay'
            )
        }

        const requestId = crypto.randomUUID()
        // The same bytes on every attempt, so a retry is the same request.
        const plaintext = utf8Encode(JSON.stringify(action))
        // The socket can still drop before Convex takes the request. The
        // Controller refuses it once we stopped waiting.
        const deadline = Date.now() + this.commandTimeoutMs
        let enrollment = record.enrollment
        this.counter ??= createWebRelayCounter({
            controllerId: this.controllerId,
            accessClientId: enrollment.accessClientId,
        })
        const counter = this.counter
        for (let attempt = 1; ; attempt++) {
            const header: RequestHeader = {
                controllerId: this.controllerId,
                identityEpoch: enrollment.identityEpoch ?? 1,
                accessClientId: enrollment.accessClientId,
                requestId,
                counter: await counter.next(),
                expiresAt: deadline,
            }
            const { sealed, keys } = await sealRequest({
                header,
                plaintext,
                controllerEncryptionKey: enrollment.controllerEncryptionKey,
                accessClientSigner: record.keys.signer,
            })
            await this.send(record, sealed, deadline)
            const reply = await this.waitForReply(
                sealed,
                keys,
                enrollment.controllerSigningKey,
                deadline
            )
            const done = (): RelayExchange => ({
                reply: this.delivered(reply),
                header,
                keys,
                controllerSigningKey: enrollment.controllerSigningKey,
            })
            if (attempt >= MAX_SEND_ATTEMPTS) return done()
            const fix = refusalFix(reply.message)
            if (fix?.identityEpoch !== undefined) {
                // The Home moved to a new Controller identity epoch; the
                // signed refusal says which. Address it from now on.
                // The projection is the usual source; this is the backstop.
                enrollment = { ...enrollment, identityEpoch: fix.identityEpoch }
                record = { keys: record.keys, enrollment }
                await this.keyStore.save(record)
                continue
            }
            if (fix?.highestCounter !== undefined) {
                // This client's counters fell behind the Controller's window.
                await counter.advancePast(fix.highestCounter)
                continue
            }
            return done()
        }
    }

    /** Emits a Command's outcome once its reply has arrived. */
    private delivered(reply: RelayReply): RelayReply {
        if (reply.message.type === 'commandResult') {
            this.emit({
                type: 'commandResult',
                requestId: reply.requestId,
                ok: reply.message.ok,
                outcome: reply.message.outcome,
                error: reply.message.error,
            })
        }
        return reply
    }

    private acknowledge(messageIds: string[]): void {
        if (messageIds.length === 0) return
        acknowledgeRelayResponses(this.convex, this.api.acknowledge, messageIds)
    }

    /** Stops waiting for a send that Convex is holding. */
    private async settleBy(sent: Promise<unknown>, deadline: number) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            await Promise.race([
                sent,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error('Relay command timed out')),
                        Math.max(0, deadline - Date.now())
                    )
                }),
            ])
        } finally {
            clearTimeout(timer)
        }
    }

    subscribeEvents(cb: (event: DeviceEvent) => void): () => void {
        this.listeners.add(cb)
        return () => {
            this.listeners.delete(cb)
        }
    }

    private emit(event: DeviceEvent): void {
        for (const listener of this.listeners) {
            listener(event)
        }
    }

    /**
     * Keeps a capability watch registered with the Controller. Each renewal
     * registers a new watch, under its own exported key, and names the one
     * it replaces so every tab holds one watch. A Controller that refuses
     * this Access Client (revoked or unknown) ends the watch.
     */
    private async renewCapabilityWatch(): Promise<void> {
        if (!this.connected) return
        const current = this.watches.at(-1)
        const sent = await this.exchange({
            type: 'watchCapabilityChanges',
            ...(current ? { renews: current.header.requestId } : {}),
        })
        if (!this.connected) return
        const { message } = sent.reply
        if (message.type === 'capabilityWatchAck') {
            this.watches = [
                ...this.watches.slice(1 - POLLED_WATCHES),
                {
                    header: sent.header,
                    keys: sent.keys,
                    controllerSigningKey: sent.controllerSigningKey,
                    window: EMPTY_REPLAY_WINDOW,
                },
            ]
            return
        }
        if (message.type !== 'commandResult') return
        // The Controller refused this Access Client's keys: no watch lives on.
        const reason = pairAgainReasonSchema.safeParse(message.error?.code)
        if (reason.success && keysRefused(reason.data)) this.watches = []
    }

    private schedulePushPoll(): void {
        if (!this.connected) return
        this.pushTimer = setTimeout(() => {
            void this.pollPushes().finally(() => {
                this.schedulePushPoll()
            })
        }, this.pollIntervalMs)
    }

    /**
     * Reads the pushes of the live watches, oldest watch first and each in
     * counter order, and emits the genuine ones. Every push read is
     * acknowledged, applied or not.
     */
    private async pollPushes(): Promise<void> {
        const watches = this.watches
        const [first] = watches
        if (!first) return
        let docs: RelayToClientDoc[]
        try {
            docs = await this.convex.query(this.api.responses, {
                controllerId: this.controllerId,
                accessClientId: first.header.accessClientId,
                requestIds: watches.map((watch) => watch.header.requestId),
            })
        } catch {
            return // the next poll retries
        }
        const read: string[] = []
        let gap = false
        for (const watch of watches) {
            const pushes = docs
                .flatMap((doc) => {
                    if (doc.kind !== 'push') return []
                    const sealed = sealedPushSchema.safeParse(doc.sealed)
                    if (!sealed.success) {
                        // Not a push at all: read, so it does not linger.
                        read.push(doc._id)
                        return []
                    }
                    return sealed.data.header.requestId ===
                        watch.header.requestId
                        ? [{ _id: doc._id, sealed: sealed.data }]
                        : []
                })
                .sort(
                    (a, b) => a.sealed.header.counter - b.sealed.header.counter
                )
            for (const doc of pushes) {
                read.push(doc._id)
                const highest = watch.window.highest
                const event = openWatchPush(watch, doc.sealed)
                if (!event) continue
                if (watch.window.highest > highest + 1) gap = true
                this.emit(event)
            }
        }
        this.acknowledge(read)
        if (gap && this.connected) {
            // A push never arrived: the snapshot brings the state current.
            await this.requestCapabilitySnapshot().catch(() => {
                // The next change or reconnect catches up.
            })
        }
    }

    /**
     * Polls for the reply to one sent request. Only a reply that opens with
     * this request's keys and verifies against the pinned Controller key
     * counts. Anything else under this requestId (a reply to an earlier
     * attempt, or one Convex forged or altered) is acknowledged and ignored.
     */
    private waitForReply(
        request: SealedRequest,
        keys: RequestKeys,
        controllerSigningKey: Uint8Array,
        deadline: number
    ): Promise<RelayReply> {
        const { header } = request
        const { requestId } = header
        return new Promise((resolve, reject) => {
            const tick = async () => {
                if (!this.connected) {
                    reject(new Error('Relay transport disconnected'))
                    return
                }
                if (Date.now() > deadline) {
                    reject(new Error('Relay command timed out'))
                    return
                }
                try {
                    const docs = await this.convex.query(this.api.responses, {
                        controllerId: this.controllerId,
                        accessClientId: header.accessClientId,
                        requestIds: [requestId],
                    })
                    const discard: string[] = []
                    for (const doc of docs) {
                        if (doc.kind !== 'response') continue
                        const sealed = sealedResponseSchema.safeParse(
                            doc.sealed
                        )
                        const message = sealed.success
                            ? openReply(
                                  sealed.data,
                                  request,
                                  keys,
                                  controllerSigningKey
                              )
                            : null
                        if (!message) {
                            discard.push(doc._id)
                            continue
                        }
                        this.acknowledge([...discard, doc._id])
                        resolve({ requestId, message })
                        return
                    }
                    this.acknowledge(discard)
                } catch {
                    // retry
                }
                setTimeout(() => {
                    void tick()
                }, this.pollIntervalMs)
            }
            void tick()
        })
    }
}

/**
 * A push's capability event, or `null` unless it is genuine and newer than
 * every push the watch has applied. Moves the watch's window on success.
 */
function openWatchPush(
    watch: LiveWatch,
    sealed: SealedPush
): Extract<
    DeviceEvent,
    { type: 'capabilityChange' | 'capabilitySnapshot' }
> | null {
    const counter = sealed.header?.counter
    // A counter at or below the highest applied is a replay or arrived out
    // of order; applying it would roll the state back.
    if (typeof counter !== 'number' || counter <= watch.window.highest) {
        return null
    }
    try {
        const opened = openPush({
            sealed,
            watch: watch.header,
            keys: watch.keys,
            controllerSigningKey: watch.controllerSigningKey,
            window: watch.window,
        })
        const text = utf8Decode(opened.plaintext)
        if (text === null) return null
        const parsed = deviceEventSchema.safeParse(JSON.parse(text))
        if (
            !parsed.success ||
            (parsed.data.type !== 'capabilityChange' &&
                parsed.data.type !== 'capabilitySnapshot')
        ) {
            return null
        }
        watch.window = opened.window
        return parsed.data
    } catch (error) {
        if (error instanceof RelayCryptoError || error instanceof SyntaxError) {
            return null
        }
        throw error
    }
}

/** The reply's message, or `null` unless it is this request's and genuine. */
function openReply(
    sealed: SealedResponse,
    request: SealedRequest,
    keys: RequestKeys,
    controllerSigningKey: Uint8Array
): RelayReplyMessage | null {
    try {
        const plaintext = openResponse({
            sealed,
            request,
            keys,
            controllerSigningKey,
        })
        const text = utf8Decode(plaintext)
        if (text === null) return null
        const parsed = relayReplyMessageSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
    } catch (error) {
        if (error instanceof RelayCryptoError || error instanceof SyntaxError) {
            return null
        }
        throw error
    }
}

/**
 * What a signed refusal asks the client to fix before trying again: a new
 * identity epoch, or counters past the Controller's highest.
 */
function refusalFix(
    message: RelayReplyMessage
): { identityEpoch?: number; highestCounter?: number } | null {
    if (message.type !== 'commandResult' || message.ok) return null
    const details = message.error?.details
    switch (message.error?.code) {
        case 'retired_epoch': {
            const parsed = epochFixSchema.safeParse(details)
            return parsed.success ? parsed.data : null
        }
        case 'replayed':
        case 'outside_window': {
            const parsed = counterFixSchema.safeParse(details)
            return parsed.success ? parsed.data : null
        }
        default:
            return null
    }
}

const safeCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const epochFixSchema = z.object({ identityEpoch: safeCount })
const counterFixSchema = z.object({ highestCounter: safeCount })
const convexErrorSchema = z.object({ data: z.object({ code: z.string() }) })

/** The `code` a ConvexError carries in its data, if any. */
function convexErrorCode(error: unknown): string | null {
    const parsed = convexErrorSchema.safeParse(error)
    return parsed.success ? parsed.data.data.code : null
}
