import {
    ApiError,
    type ApplyUpdateResponse,
    type AssignRoomRequest,
    applyUpdateResponseSchema,
    assignRoomRequestSchema,
    type BootstrapOwnerRequest,
    type ClientToken,
    type CommandResult,
    type CreateRoomRequest,
    clientTokenSchema,
    createRoomRequestSchema,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type HistoryQuery,
    type HistoryQueryRead,
    type HomeMeterDesignation,
    type HomeMeterDesignationSelection,
    type HouseholdMember,
    historyQueryReadSchema,
    homeMeterDesignationResultSchema,
    householdMemberSchema,
    type PatchDeviceRequest,
    type PatchRoomRequest,
    parseDeviceList,
    patchRoomRequestSchema,
    type RelayToControllerEnvelope,
    type ReleaseChannel,
    type RenameDeviceRequest,
    type RenameRoomRequest,
    type Room,
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
    renameDeviceRequestSchema,
    renameRoomRequestSchema,
    type SwitchReleaseChannelResponse,
    switchReleaseChannelResponseSchema,
    type UpdateStatusResponse,
    updateStatusResponseSchema,
} from '@nemu/protocol'
import type { ConvexReactClient } from 'convex/react'
import type { FunctionReference } from 'convex/server'
import type { GetToken } from '../http.ts'
import type { ControllerTransport } from './types.ts'

type RelaySendArgs = {
    controllerId: string
    requestId: string
    payload: string
}

type RelayResponseDoc = {
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
 * Relay transport talks to Convex mailbox functions.
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
        const requestId = crypto.randomUUID()
        const token = this.getToken()
        if (!token) throw new Error('Missing client token')

        const envelope = relayToControllerEnvelopeSchema.parse({
            requestId,
            clientToken: token,
            message: { type: 'getDevices' },
        })

        await this.convex.mutation(this.api.send, {
            controllerId: this.controllerId,
            requestId,
            payload: JSON.stringify(envelope),
        })
        this.pendingIds.add(requestId)

        const response = await this.waitForResponse(requestId)
        const parsed = relayToClientEnvelopeSchema.parse(
            JSON.parse(response.payload)
        )

        if (
            parsed.message.type === 'devices' ||
            parsed.message.type === 'snapshot'
        ) {
            return parseDeviceList(parsed.message.devices)
        }

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
        // Convex holds mutations while disconnected and sends them on
        // reconnect. A one-time Command must not fire later (ADR-0015).
        if (!this.convex.connectionState().isWebSocketConnected) {
            throw new ApiError(
                'relay_disconnected',
                'Not connected to the Relay'
            )
        }
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

    async getReleaseStatus(): Promise<UpdateStatusResponse> {
        const parsed = await this.request({ type: 'releaseStatus' })
        if (parsed.message.type === 'releaseStatus') {
            return updateStatusResponseSchema.parse(parsed.message)
        }
        this.throwIfCommandError(parsed, 'read the installed Release')
        throw new Error('Unexpected relay response for releaseStatus')
    }

    async installRelease(): Promise<ApplyUpdateResponse> {
        const parsed = await this.request({ type: 'installRelease' })
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

    async deleteRoom(roomId: string): Promise<void> {
        await this.expectOk({ type: 'deleteRoom', roomId }, 'delete the Room')
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
        parsed: ReturnType<typeof relayToClientEnvelopeSchema.parse>,
        action: string
    ): void {
        if (parsed.message.type === 'commandResult' && !parsed.message.ok) {
            // Same error shape as LAN, so callers can act on the code.
            throw new ApiError(
                parsed.message.error?.code ?? 'relay_error',
                parsed.message.error?.message ?? `Failed to ${action}`
            )
        }
    }

    private async request(
        message: RelayRequestMessage
    ): Promise<ReturnType<typeof relayToClientEnvelopeSchema.parse>> {
        const requestId = crypto.randomUUID()
        const token = this.getToken()
        if (!token) throw new Error('Missing client token')

        const envelope = relayToControllerEnvelopeSchema.parse({
            requestId,
            clientToken: token,
            message,
        })

        await this.convex.mutation(this.api.send, {
            controllerId: this.controllerId,
            requestId,
            payload: JSON.stringify(envelope),
        })
        this.pendingIds.add(requestId)

        const response = await this.waitForResponse(requestId)
        return relayToClientEnvelopeSchema.parse(JSON.parse(response.payload))
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
            for (const message of messages) {
                const key = `${message.requestId}:${message.payload}`
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
                    if (this.seenResponses.has(key)) continue
                    this.seenResponses.add(key)
                    if (envelope.message.type === 'commandResult') {
                        this.emit({
                            type: 'commandResult',
                            requestId: envelope.requestId,
                            ok: envelope.message.ok,
                            outcome: envelope.message.outcome,
                            error: envelope.message.error,
                        })
                    } else if (
                        envelope.message.type === 'capabilitySnapshot' ||
                        envelope.message.type === 'capabilityChange'
                    ) {
                        this.emit(envelope.message)
                    } else if (
                        envelope.message.type === 'devices' ||
                        envelope.message.type === 'snapshot'
                    ) {
                        this.emit({ type: 'resync' })
                    }
                } catch {
                    // ignore malformed payloads
                }
            }
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

    private waitForResponse(requestId: string): Promise<RelayResponseDoc> {
        const started = Date.now()
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
