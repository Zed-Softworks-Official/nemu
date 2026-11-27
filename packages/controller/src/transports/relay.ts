import {
    ApiError,
    type ApplyUpdateResponse,
    type AssignRoomRequest,
    applyUpdateResponseSchema,
    assignRoomRequestSchema,
    type BootstrapOwnerRequest,
    type ClientToken,
    type CommandResult,
    type CommissionResponse,
    type CreateRoomRequest,
    clientTokenSchema,
    createRoomRequestSchema,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
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
    type PatchDeviceRequest,
    type PatchRoomRequest,
    type PermitJoinResponse,
    parseDeviceList,
    patchRoomRequestSchema,
    permitJoinRequestSchema,
    permitJoinResponseSchema,
    type RelayToClientEnvelope,
    type RelayToControllerEnvelope,
    type ReleaseChannel,
    type RenameDeviceRequest,
    type RenameRoomRequest,
    type Room,
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
    renameDeviceRequestSchema,
    renameRoomRequestSchema,
    type SessionResponse,
    type SwitchReleaseChannelResponse,
    sessionResponseSchema,
    switchReleaseChannelResponseSchema,
    type UpdateStatusResponse,
    updateStatusResponseSchema,
} from '@nemu/protocol'
import type { ConvexReactClient } from 'convex/react'
import type { FunctionReference } from 'convex/server'
import type { GetToken } from '../http.ts'
import {
    acknowledgeRelayResponses,
    type RelayAcknowledgeRef,
} from './relay-acknowledge.ts'
import type { ControllerTransport } from './types.ts'

type RelaySendArgs = {
    controllerId: string
    requestId: string
    payload: string
}

type RelayResponseDoc = {
    _id: string
    requestId: string
    payload: string
    direction: 'toController' | 'toClient'
}

export type RelayApi = {
    // Return type is intentionally loose so generated Convex Id<"relayMessages">
    // (and similar) assign without casts at the app boundary.
    send: FunctionReference<'mutation', 'public', RelaySendArgs, unknown>
    responses: FunctionReference<
        'query',
        'public',
        { requestIds: string[] },
        RelayResponseDoc[]
    >
    acknowledge: RelayAcknowledgeRef
}

type RelayRequestMessage = Extract<
    RelayToControllerEnvelope,
    { clientToken: string }
>['message']

export type RelayTransportOptions = {
    convex: ConvexReactClient
    api: RelayApi
    controllerId: string
    getToken: GetToken
    pollIntervalMs?: number
    commandTimeoutMs?: number
}

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
    'listTokens',
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
 * Relay transport talks to Convex mailbox functions. It has no way to send a
 * Matter pairing code or Wi-Fi credentials, which must not reach Convex until
 * Relay envelopes are encrypted end to end (NEM-63, ADR-0034).
 * Capability snapshots and live changes use the same messages as LAN.
 */
export class RelayTransport implements ControllerTransport {
    readonly mode = 'relay' as const

    private readonly convex: ConvexReactClient
    private readonly api: RelayApi
    private readonly controllerId: string
    private readonly getToken: GetToken
    private readonly pollIntervalMs: number
    private readonly commandTimeoutMs: number
    private readonly listeners = new Set<(event: DeviceEvent) => void>()
    private readonly pendingIds = new Set<string>()
    private pollTimer: ReturnType<typeof setInterval> | null = null
    private seenResponses = new Set<string>()
    private connected = false
    private watchTimer: ReturnType<typeof setInterval> | null = null
    private watchRequestId: string | null = null
    private previousWatchRequestId: string | null = null

    constructor(options: RelayTransportOptions) {
        this.convex = options.convex
        this.api = options.api
        this.controllerId = options.controllerId
        this.getToken = options.getToken
        this.pollIntervalMs = options.pollIntervalMs ?? 1_000
        this.commandTimeoutMs = options.commandTimeoutMs ?? 20_000
    }

    async connect(): Promise<void> {
        this.connected = true
        this.startPolling()
        this.watchTimer = setInterval(() => {
            void this.renewCapabilityWatch().catch(() => {
                // The next renewal retries. Live changes resume when the watch is accepted.
            })
        }, 20_000)
        void this.renewCapabilityWatch().catch(() => {
            // The renewal interval retries.
        })
    }

    disconnect(): void {
        this.connected = false
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = null
        }
        if (this.watchTimer) {
            clearInterval(this.watchTimer)
            this.watchTimer = null
        }
        this.watchRequestId = null
        this.previousWatchRequestId = null
        this.pendingIds.clear()
        this.seenResponses.clear()
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

    async getTokens(): Promise<ClientToken[]> {
        const parsed = await this.request({ type: 'listTokens' })
        if (parsed.message.type === 'tokens') {
            return parsed.message.tokens.map((token) =>
                clientTokenSchema.parse(token)
            )
        }
        this.throwIfCommandError(parsed, 'list devices')
        throw new Error('Unexpected relay response for listTokens')
    }

    async revokeToken(tokenId: string): Promise<void> {
        const parsed = await this.request({ type: 'revokeToken', tokenId })
        if (parsed.message.type === 'commandResult' && parsed.message.ok) {
            return
        }
        this.throwIfCommandError(parsed, 'revoke device')
        throw new Error('Unexpected relay response for revokeToken')
    }

    async revokeCurrentToken(): Promise<void> {
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

    async bootstrapOwner(
        request: BootstrapOwnerRequest
    ): Promise<HouseholdMember> {
        const parsed = await this.request({
            type: 'bootstrapOwner',
            userId: request.userId,
            email: request.email,
            displayName: request.displayName,
        })
        if (parsed.message.type === 'member') {
            return householdMemberSchema.parse(parsed.message.member)
        }
        this.throwIfCommandError(parsed, 'bootstrap owner')
        throw new Error('Unexpected relay response for bootstrapOwner')
    }

    private throwIfCommandError(
        parsed: RelayToClientEnvelope,
        action: string
    ): void {
        if (parsed.message.type === 'commandResult' && !parsed.message.ok) {
            // Same error shape as LAN, so callers can act on the code.
            throw new ApiError(
                parsed.message.error?.code ?? 'relay_error',
                parsed.message.error?.message ?? `Failed to ${action}`,
                undefined,
                parsed.message.error?.details
            )
        }
    }

    private async request(
        message: RelayRequestMessage
    ): Promise<RelayToClientEnvelope> {
        const requestId = crypto.randomUUID()
        const token = this.getToken()
        if (!token) throw new Error('Missing client token')

        // Convex holds mutations while disconnected and sends them on
        // reconnect. A write must not happen later (ADR-0015).
        const write = !RELAY_READS.has(message.type)
        if (write && !this.convex.connectionState().isWebSocketConnected) {
            throw new ApiError(
                'relay_disconnected',
                'Not connected to the Relay'
            )
        }

        const envelope = relayToControllerEnvelopeSchema.parse({
            requestId,
            clientToken: token,
            // The socket can still drop before Convex takes this write. The
            // Controller refuses it if it arrives after we stopped waiting.
            expiresAt: write ? Date.now() + this.commandTimeoutMs : undefined,
            message,
        })

        const started = Date.now()
        await this.settleInTime(
            this.convex.mutation(this.api.send, {
                controllerId: this.controllerId,
                requestId,
                payload: JSON.stringify(envelope),
            })
        )
        this.pendingIds.add(requestId)

        const response = await this.waitForResponse(requestId, started)
        const parsed = relayToClientEnvelopeSchema.parse(
            JSON.parse(response.payload)
        )
        this.emitCommandResultOnce(response, parsed)
        return parsed
    }

    /**
     * Emits a Command's outcome once, whether the waiter or the general poll
     * read the response first. The waiter deletes the response once it has
     * it, so the poll may never see it.
     */
    private emitCommandResultOnce(
        response: RelayResponseDoc,
        envelope: RelayToClientEnvelope
    ): void {
        if (envelope.message.type !== 'commandResult') return
        const key = `${response.requestId}:${response.payload}`
        if (this.seenResponses.has(key)) return
        this.seenResponses.add(key)
        this.emit({
            type: 'commandResult',
            requestId: envelope.requestId,
            ok: envelope.message.ok,
            outcome: envelope.message.outcome,
            error: envelope.message.error,
        })
    }

    private acknowledge(messageIds: string[]): void {
        acknowledgeRelayResponses(this.convex, this.api.acknowledge, messageIds)
    }

    /** Stops waiting for a send that Convex is holding. */
    private async settleInTime(sent: Promise<unknown>): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            await Promise.race([
                sent,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error('Relay command timed out')),
                        this.commandTimeoutMs
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

    private startPolling(): void {
        if (this.pollTimer) return
        this.pollTimer = setInterval(() => {
            void this.pollResponses()
        }, this.pollIntervalMs)
    }

    private async pollResponses(): Promise<void> {
        if (!this.connected || this.pendingIds.size === 0) return
        try {
            const requestIds = [...this.pendingIds]
            const messages = await this.convex.query(this.api.responses, {
                requestIds,
            })
            // Only watch messages are used here. A request's waiter deletes
            // its own response, which it may not have read yet.
            const watchIds = new Set(
                [this.watchRequestId, this.previousWatchRequestId].filter(
                    (id): id is string => id !== null
                )
            )
            const used: string[] = []
            for (const message of messages) {
                const key = `${message.requestId}:${message.payload}`
                if (watchIds.has(message.requestId)) used.push(message._id)
                try {
                    const envelope = relayToClientEnvelopeSchema.parse(
                        JSON.parse(message.payload)
                    )
                    // The active view is returned by queryHistory. Do not retain the series here.
                    if (
                        envelope.message.type === 'historyQueryResult' ||
                        envelope.message.type === 'historyQueryRestart' ||
                        envelope.message.type === 'homeMeterDesignation'
                    ) {
                        continue
                    }
                    if (envelope.message.type === 'commandResult') {
                        this.emitCommandResultOnce(message, envelope)
                        continue
                    }
                    // A retried commissioning repeats the same steps, so
                    // each pushed message is told apart by its ID, not its
                    // payload.
                    if (envelope.message.type === 'commissioningStep') {
                        if (this.seenResponses.has(message._id)) continue
                        this.seenResponses.add(message._id)
                        this.emit(envelope.message)
                        continue
                    }
                    if (this.seenResponses.has(key)) continue
                    this.seenResponses.add(key)
                    if (
                        envelope.message.type === 'capabilitySnapshot' ||
                        envelope.message.type === 'capabilityChange'
                    ) {
                        this.emit(envelope.message)
                    }
                } catch {
                    // ignore malformed payloads
                }
            }
            this.acknowledge(used)
        } catch {
            // transient poll failures are ignored; next tick retries
        }
    }

    private async renewCapabilityWatch(): Promise<void> {
        if (!this.connected) return
        const token = this.getToken()
        if (!token) return
        const requestId = crypto.randomUUID()
        const envelope = relayToControllerEnvelopeSchema.parse({
            requestId,
            clientToken: token,
            message: { type: 'watchCapabilityChanges' },
        })
        await this.convex.mutation(this.api.send, {
            controllerId: this.controllerId,
            requestId,
            payload: JSON.stringify(envelope),
        })
        if (this.previousWatchRequestId) {
            this.pendingIds.delete(this.previousWatchRequestId)
        }
        this.previousWatchRequestId = this.watchRequestId
        this.watchRequestId = requestId
        this.pendingIds.add(requestId)
    }

    private waitForResponse(
        requestId: string,
        started: number
    ): Promise<RelayResponseDoc> {
        return new Promise((resolve, reject) => {
            const tick = async () => {
                if (!this.connected) {
                    reject(new Error('Relay transport disconnected'))
                    return
                }
                if (Date.now() - started > this.commandTimeoutMs) {
                    this.pendingIds.delete(requestId)
                    reject(new Error('Relay command timed out'))
                    return
                }
                try {
                    const messages = await this.convex.query(
                        this.api.responses,
                        {
                            requestIds: [requestId],
                        }
                    )
                    const match = messages.find(
                        (m) =>
                            m.requestId === requestId &&
                            m.direction === 'toClient'
                    )
                    if (match) {
                        this.pendingIds.delete(requestId)
                        resolve(match)
                        this.acknowledge([match._id])
                        return
                    }
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
