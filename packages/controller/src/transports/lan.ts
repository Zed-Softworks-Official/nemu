import {
    type BootstrapOwnerRequest,
    bootstrapOwnerRequestSchema,
    type ClientToken,
    type CommandResult,
    type CommissionRequest,
    type CommissionResponse,
    type CreateRoomRequest,
    clientWsMessageSchema,
    commissionRequestSchema,
    commissionResponseSchema,
    createRoomRequestSchema,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    deviceEventSchema,
    deviceSchema,
    devicesResponseSchema,
    type HouseholdMember,
    householdMemberSchema,
    inviteMemberRequestSchema,
    type MatterWifiResponse,
    matterWifiResponseSchema,
    membersResponseSchema,
    type PatchDeviceRequest,
    type PatchOutletRequest,
    type PatchRoomRequest,
    type PermitJoinResponse,
    patchDeviceRequestSchema,
    patchOutletRequestSchema,
    patchRoomRequestSchema,
    permitJoinRequestSchema,
    permitJoinResponseSchema,
    type Room,
    roomSchema,
    roomsResponseSchema,
    type SaveMatterWifiRequest,
    saveMatterWifiRequestSchema,
    tokensResponseSchema,
} from '@nemu/protocol'
import type { AxiosInstance } from 'axios'
import { createControllerHttp, type GetToken } from '../http'
import { isLoopbackHostname, isMixedContentUrl } from '../mixedContent'
import type { ControllerTransport } from './types'

function toWsUrl(baseUrl: string): string {
    const url = new URL(baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/ws'
    url.search = ''
    url.hash = ''
    return url.toString()
}

function assertSafeWifiTransport(baseUrl: string): void {
    let parsed: URL
    try {
        parsed = new URL(baseUrl)
    } catch {
        throw new Error('Controller URL is invalid')
    }
    if (parsed.protocol === 'https:') return
    if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))
        return
    throw new Error(
        'Wi-Fi credentials require HTTPS, or HTTP only on localhost'
    )
}

type PendingCommand = {
    resolve: (result: CommandResult) => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
}

export type LanTransportOptions = {
    baseUrl: string
    getToken: GetToken
    commandTimeoutMs?: number
    reconnectBaseMs?: number
    reconnectMaxMs?: number
}

export class LanTransport implements ControllerTransport {
    readonly mode = 'lan' as const

    private readonly baseUrl: string
    private readonly getToken: GetToken
    private readonly commandTimeoutMs: number
    private readonly reconnectBaseMs: number
    private readonly reconnectMaxMs: number
    private http: AxiosInstance
    private ws: WebSocket | null = null
    private intentionalClose = false
    private reconnectAttempt = 0
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private readonly listeners = new Set<(event: DeviceEvent) => void>()
    private readonly pending = new Map<string, PendingCommand>()

    constructor(options: LanTransportOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '')
        this.getToken = options.getToken
        this.commandTimeoutMs = options.commandTimeoutMs ?? 10_000
        this.reconnectBaseMs = options.reconnectBaseMs ?? 500
        this.reconnectMaxMs = options.reconnectMaxMs ?? 15_000
        this.http = createControllerHttp(this.baseUrl, this.getToken)
    }

    async connect(): Promise<void> {
        this.intentionalClose = false
        // HTTPS dashboards (app.nemu.sh) cannot open ws:// LAN endpoints.
        // Stay on REST-only LAN rather than triggering a mixed-content block.
        if (
            isMixedContentUrl(this.baseUrl) ||
            isMixedContentUrl(toWsUrl(this.baseUrl))
        ) {
            return
        }
        await this.openSocket()
    }

    disconnect(): void {
        this.intentionalClose = true
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
        this.ws?.close()
        this.ws = null
        for (const [, pending] of this.pending) {
            clearTimeout(pending.timer)
            pending.reject(new Error('LAN transport disconnected'))
        }
        this.pending.clear()
    }

    async getDevices(): Promise<Device[]> {
        const { data } = await this.http.get('/api/devices')
        return devicesResponseSchema.parse(data).devices
    }

    async permitJoin(seconds: number): Promise<PermitJoinResponse> {
        const body = permitJoinRequestSchema.parse({ seconds })
        const { data } = await this.http.post('/api/zigbee/permit-join', body)
        return permitJoinResponseSchema.parse(data)
    }

    async commissionMatter(
        request: CommissionRequest
    ): Promise<CommissionResponse> {
        assertSafeWifiTransport(this.baseUrl)
        const body = commissionRequestSchema.parse(request)
        const { data } = await this.http.post('/api/matter/commission', body, {
            timeout: 20_000,
        })
        return commissionResponseSchema.parse(data)
    }

    async cancelMatterCommission(): Promise<CommissionResponse> {
        const { data } = await this.http.post(
            '/api/matter/cancel',
            {},
            { timeout: 20_000 }
        )
        return commissionResponseSchema.parse(data)
    }

    async getMatterWifi(): Promise<MatterWifiResponse> {
        const { data } = await this.http.get('/api/matter/wifi')
        return matterWifiResponseSchema.parse(data)
    }

    async saveMatterWifi(
        request: SaveMatterWifiRequest
    ): Promise<MatterWifiResponse> {
        assertSafeWifiTransport(this.baseUrl)
        const body = saveMatterWifiRequestSchema.parse(request)
        const { data } = await this.http.put('/api/matter/wifi', body)
        return matterWifiResponseSchema.parse(data)
    }

    async getRooms(): Promise<Room[]> {
        const { data } = await this.http.get('/api/rooms')
        return roomsResponseSchema.parse(data).rooms
    }

    async createRoom(request: CreateRoomRequest): Promise<Room> {
        const body = createRoomRequestSchema.parse(request)
        const { data } = await this.http.post('/api/rooms', body)
        return roomSchema.parse(data)
    }

    async patchRoom(roomId: string, patch: PatchRoomRequest): Promise<Room> {
        const body = patchRoomRequestSchema.parse(patch)
        const { data } = await this.http.patch(
            `/api/rooms/${encodeURIComponent(roomId)}`,
            body
        )
        return roomSchema.parse(data)
    }

    async deleteRoom(roomId: string): Promise<void> {
        await this.http.delete(`/api/rooms/${encodeURIComponent(roomId)}`)
    }

    async patchDevice(
        deviceId: string,
        patch: PatchDeviceRequest
    ): Promise<Device> {
        const body = patchDeviceRequestSchema.parse(patch)
        const { data } = await this.http.patch(
            `/api/devices/${encodeURIComponent(deviceId)}`,
            body
        )
        return deviceSchema.parse(data)
    }

    async patchOutlet(
        deviceId: string,
        outletId: string,
        patch: PatchOutletRequest
    ): Promise<void> {
        const body = patchOutletRequestSchema.parse(patch)
        await this.http.patch(
            `/api/devices/${encodeURIComponent(deviceId)}/outlets/${encodeURIComponent(outletId)}`,
            body
        )
    }

    async forgetDevice(deviceId: string): Promise<void> {
        await this.http.delete(`/api/devices/${encodeURIComponent(deviceId)}`, {
            timeout: 20_000,
        })
    }

    async getMembers(): Promise<HouseholdMember[]> {
        const { data } = await this.http.get('/api/members')
        return membersResponseSchema.parse(data).members
    }

    async inviteMember(email: string): Promise<HouseholdMember> {
        const body = inviteMemberRequestSchema.parse({ email })
        const { data } = await this.http.post('/api/members', body)
        return householdMemberSchema.parse(data)
    }

    async removeMember(memberId: string): Promise<void> {
        await this.http.delete(`/api/members/${encodeURIComponent(memberId)}`)
    }

    async getTokens(): Promise<ClientToken[]> {
        const { data } = await this.http.get('/api/tokens')
        return tokensResponseSchema.parse(data).tokens
    }

    async revokeToken(tokenId: string): Promise<void> {
        await this.http.delete(`/api/tokens/${encodeURIComponent(tokenId)}`)
    }

    async revokeCurrentToken(): Promise<void> {
        await this.http.delete('/api/tokens/current')
    }

    async bootstrapOwner(
        request: BootstrapOwnerRequest
    ): Promise<HouseholdMember> {
        const body = bootstrapOwnerRequestSchema.parse(request)
        const { data } = await this.http.post('/api/members/bootstrap', body)
        return householdMemberSchema.parse(data)
    }

    async sendCommand(cmd: DeviceCommand): Promise<CommandResult> {
        const requestId = crypto.randomUUID()

        // Prefer WebSocket command path when connected; fall back to REST.
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return await this.sendViaWs(requestId, cmd)
        }

        await this.http.post(`/api/devices/${cmd.deviceId}/set`, cmd.payload)
        return { requestId, ok: true }
    }

    subscribeEvents(cb: (event: DeviceEvent) => void): () => void {
        this.listeners.add(cb)
        return () => {
            this.listeners.delete(cb)
        }
    }

    private async sendViaWs(
        requestId: string,
        cmd: DeviceCommand
    ): Promise<CommandResult> {
        const message = clientWsMessageSchema.parse({
            type: 'command',
            requestId,
            deviceId: cmd.deviceId,
            payload: cmd.payload,
        })

        return await new Promise<CommandResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId)
                reject(new Error('Command timed out'))
            }, this.commandTimeoutMs)

            this.pending.set(requestId, { resolve, reject, timer })
            if (this.ws) {
                this.ws.send(JSON.stringify(message))
            } else {
                reject(new Error('WebSocket not connected'))
            }
        })
    }

    private openSocket(): Promise<void> {
        const wsUrl = toWsUrl(this.baseUrl)
        if (isMixedContentUrl(this.baseUrl) || isMixedContentUrl(wsUrl)) {
            return Promise.resolve()
        }

        return new Promise((resolve, reject) => {
            const token = this.getToken()
            // Token via query is a pragmatic v1; header auth isn't available in browsers.
            const url = token
                ? `${wsUrl}?token=${encodeURIComponent(token)}`
                : wsUrl

            const ws = new WebSocket(url)
            this.ws = ws

            const onOpen = () => {
                this.reconnectAttempt = 0
                cleanup()
                resolve()
            }
            const onError = () => {
                cleanup()
                reject(new Error('WebSocket connection failed'))
            }
            const cleanup = () => {
                ws.removeEventListener('open', onOpen)
                ws.removeEventListener('error', onError)
            }

            ws.addEventListener('open', onOpen)
            ws.addEventListener('error', onError)
            ws.addEventListener('message', (ev) => this.handleMessage(ev))
            ws.addEventListener('close', () => this.handleClose())
        })
    }

    private handleMessage(ev: MessageEvent): void {
        let raw: unknown
        try {
            raw = JSON.parse(String(ev.data))
        } catch {
            return
        }

        const parsed = deviceEventSchema.safeParse(raw)
        if (!parsed.success) {
            return
        }

        const event = parsed.data
        if (event.type === 'commandResult') {
            const pending = this.pending.get(event.requestId)
            if (pending) {
                clearTimeout(pending.timer)
                this.pending.delete(event.requestId)
                pending.resolve({
                    requestId: event.requestId,
                    ok: event.ok,
                    error: event.error,
                })
            }
        }

        for (const listener of this.listeners) {
            listener(event)
        }
    }

    private handleClose(): void {
        this.ws = null
        if (this.intentionalClose) return

        const delay = Math.min(
            this.reconnectBaseMs * 2 ** this.reconnectAttempt,
            this.reconnectMaxMs
        )
        this.reconnectAttempt++
        this.reconnectTimer = setTimeout(() => {
            void this.openSocket().catch(() => {
                // handleClose will schedule another attempt
            })
        }, delay)
    }
}
