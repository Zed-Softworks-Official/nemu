import {
    type BootstrapOwnerRequest,
    type ClientToken,
    type CommandResult,
    clientTokenSchema,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    deviceSchema,
    type HouseholdMember,
    householdMemberSchema,
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
} from '@nemu/protocol'
import type { ConvexReactClient } from 'convex/react'
import type { FunctionReference } from 'convex/server'
import type { GetToken } from '../http'
import type { ControllerTransport } from './types'

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
 * Live state is coarser than LAN: we poll for responses and optional snapshots.
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
    }

    disconnect(): void {
        this.connected = false
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = null
        }
        this.pendingIds.clear()
        this.seenResponses.clear()
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
            return parsed.message.devices.map((d) => deviceSchema.parse(d))
        }

        throw new Error('Unexpected relay response for getDevices')
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
                error: parsed.message.error,
            }
        }
        throw new Error('Unexpected relay response for command')
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
        this.throwIfCommandError(parsed, 'unpair this dashboard')
        throw new Error('Unexpected relay response for revokeCurrent')
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
            throw new Error(
                parsed.message.error?.message ?? `Failed to ${action}`
            )
        }
    }

    private async request(
        message: Extract<
            import('@nemu/protocol').RelayToControllerEnvelope,
            { clientToken: string }
        >['message']
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
                if (this.seenResponses.has(key)) continue
                this.seenResponses.add(key)

                try {
                    const envelope = relayToClientEnvelopeSchema.parse(
                        JSON.parse(message.payload)
                    )
                    if (envelope.message.type === 'commandResult') {
                        this.emit({
                            type: 'commandResult',
                            requestId: envelope.requestId,
                            ok: envelope.message.ok,
                            error: envelope.message.error,
                        })
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
