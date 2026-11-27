// A LAN Controller for transport tests: CPace pairing, Access grants and
// Local sessions over real HTTP, on the protocol package's crypto core.
// Core implements the same routes; the shared wire vectors tie the two
// crypto implementations together.

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
    b64urlDecode,
    b64urlEncode,
    CpaceResponder,
    ed25519PublicKey,
    ed25519Signer,
    issueGrant,
    signLanRefusal,
    verifyLocalSessionChallenge,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'

type Request = {
    method: string
    path: string
    authorization: string | undefined
    body: Record<string, unknown> | undefined
}

type Reply = { status: number; body?: unknown }

type PairedClient = {
    signingKey: Uint8Array
    encryptionKey: Uint8Array
    userId: string
}

export type FakeLanControllerOptions = {
    controllerId?: string
    /** The Pairing code this Controller pairs with. */
    code?: string
    /** Answer pairing with these keys instead of the ones it signs with. */
    advertisedKeys?: { signingKey: Uint8Array; encryptionKey: Uint8Array }
}

/**
 * How a Local session's pair-again refusal is signed: as Core does (over
 * the client's nonce), not at all, by another key, or with the signature
 * of the first refusal it sent (a replay).
 */
export type FakeRefusalSigning = 'signed' | 'unsigned' | 'impostor' | 'replayed'

function bytes(value: unknown): Uint8Array {
    const decoded = typeof value === 'string' ? b64urlDecode(value) : null
    if (!decoded) throw new Error('bad base64url')
    return decoded
}

function error(status: number, code: string): Reply {
    return { status, body: { error: { code, message: code } } }
}

export class FakeLanController {
    readonly controllerId: string
    readonly signingSecret = crypto.getRandomValues(new Uint8Array(32))
    readonly encryptionSecret = crypto.getRandomValues(new Uint8Array(32))
    readonly signingKey: Uint8Array
    readonly encryptionKey: Uint8Array
    /** Every request, in order. */
    readonly requests: Request[] = []
    /** Extra routes, tried before the built-in ones. */
    route: (request: Request) => Reply | undefined = () => undefined
    baseUrl = ''

    private readonly code: string
    private readonly advertised: {
        signingKey: Uint8Array
        encryptionKey: Uint8Array
    }
    private readonly server: Server
    private readonly runs = new Map<
        string,
        { sid: Uint8Array; responder?: CpaceResponder; userId?: string }
    >()
    private readonly clients = new Map<string, PairedClient>()
    private readonly challenges = new Set<string>()
    private readonly sessions = new Map<string, string>()
    refusals: FakeRefusalSigning = 'signed'
    private firstRefusalSignature: string | null = null

    constructor(options: FakeLanControllerOptions = {}) {
        this.controllerId = options.controllerId ?? 'nemu_00000000feedbeef'
        this.code = options.code ?? '135790'
        this.signingKey = ed25519PublicKey(this.signingSecret)
        this.encryptionKey = x25519PublicKey(this.encryptionSecret)
        this.advertised = options.advertisedKeys ?? {
            signingKey: this.signingKey,
            encryptionKey: this.encryptionKey,
        }
        this.server = createServer((req, res) => {
            let raw = ''
            req.on('data', (chunk) => {
                raw += chunk
            })
            req.on('end', async () => {
                const request: Request = {
                    method: req.method ?? '',
                    path: req.url ?? '',
                    authorization: req.headers.authorization,
                    body: raw ? JSON.parse(raw) : undefined,
                }
                this.requests.push(request)
                let reply: Reply
                try {
                    reply = this.route(request) ?? (await this.handle(request))
                } catch {
                    reply = error(400, 'bad_request')
                }
                res.writeHead(reply.status, {
                    'content-type': 'application/json',
                })
                res.end(
                    reply.body === undefined ? '' : JSON.stringify(reply.body)
                )
            })
        })
    }

    async start(): Promise<this> {
        await new Promise<void>((resolve) =>
            this.server.listen(0, '127.0.0.1', resolve)
        )
        this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
        return this
    }

    stop(): void {
        this.server.closeAllConnections()
        this.server.close()
    }

    /** Sees each WebSocket upgrade's URL, then drops the connection. */
    onUpgrade(listener: (url: string) => void): void {
        this.server.on('upgrade', (req, socket) => {
            listener(req.url ?? '')
            socket.destroy()
        })
    }

    private async refusal(
        code: string,
        accessClientId: string,
        clientNonce: unknown
    ): Promise<Reply> {
        const reply = error(401, code)
        if (this.refusals === 'unsigned') return reply
        const signature = b64urlEncode(
            await signLanRefusal(
                ed25519Signer(
                    this.refusals === 'impostor'
                        ? new Uint8Array(32).fill(9)
                        : this.signingSecret
                ),
                {
                    controllerId: this.controllerId,
                    accessClientId,
                    code,
                    clientNonce: bytes(clientNonce),
                }
            )
        )
        this.firstRefusalSignature ??= signature
        const refusalSignature =
            this.refusals === 'replayed'
                ? this.firstRefusalSignature
                : signature
        return {
            status: 401,
            body: {
                error: { code, message: code, details: { refusalSignature } },
            },
        }
    }

    /** Revokes an Access Client and ends its Local sessions. */
    revoke(accessClientId: string): void {
        this.clients.delete(accessClientId)
        this.expireSessions()
    }

    /** Ends every Local session, as ten minutes passing would. */
    expireSessions(): void {
        this.sessions.clear()
    }

    sessionCount(): number {
        return this.sessions.size
    }

    private async handle(request: Request): Promise<Reply> {
        const { method, path, body } = request
        if (method === 'GET' && path === '/api/identify') {
            return {
                status: 200,
                body: { controllerId: this.controllerId, name: 'Test Home' },
            }
        }
        if (method === 'POST' && path === '/api/pairing/runs') {
            const runId = crypto.randomUUID()
            const sid = crypto.getRandomValues(new Uint8Array(16))
            this.runs.set(runId, { sid })
            return {
                status: 201,
                body: {
                    runId,
                    sid: b64urlEncode(sid),
                    controllerId: this.controllerId,
                },
            }
        }
        const step = path.match(
            /^\/api\/pairing\/runs\/([^/]+)\/(exchange|confirm)$/
        )
        if (method === 'POST' && step && body) {
            const run = this.runs.get(step[1] ?? '')
            if (!run) return error(404, 'pairing_run_not_found')
            if (step[2] === 'exchange') {
                run.responder = new CpaceResponder(
                    {
                        code: this.code,
                        controllerId: this.controllerId,
                        sid: run.sid,
                    },
                    this.advertised,
                    { ya: bytes(body.ya), adA: bytes(body.adA) }
                )
                run.userId = String(body.userId)
                const { yb, adB, tagB } = run.responder.message
                return {
                    status: 200,
                    body: {
                        yb: b64urlEncode(yb),
                        adB: b64urlEncode(adB),
                        tagB: b64urlEncode(tagB),
                    },
                }
            }
            this.runs.delete(step[1] ?? '')
            if (!run.responder) return error(404, 'pairing_run_not_found')
            let keys: { signingKey: Uint8Array; encryptionKey: Uint8Array }
            try {
                keys = run.responder.confirm(bytes(body.tagA)).accessClientKeys
            } catch {
                return error(401, 'invalid_code')
            }
            const accessClientId = crypto.randomUUID()
            const membershipId = `mem_${run.userId}`
            this.clients.set(accessClientId, {
                ...keys,
                userId: run.userId ?? '',
            })
            const grant = await issueGrant(
                {
                    controllerId: this.controllerId,
                    accessClientId,
                    membershipId,
                    signingKey: keys.signingKey,
                    encryptionKey: keys.encryptionKey,
                    issuedAt: Math.floor(Date.now() / 1000),
                },
                ed25519Signer(this.signingSecret)
            )
            return {
                status: 200,
                body: {
                    controllerId: this.controllerId,
                    accessClientId,
                    membershipId,
                    grant,
                },
            }
        }
        if (method === 'POST' && path === '/api/local-sessions/challenge') {
            const nonce = b64urlEncode(
                crypto.getRandomValues(new Uint8Array(32))
            )
            this.challenges.add(nonce)
            return { status: 200, body: { nonce } }
        }
        if (method === 'POST' && path === '/api/local-sessions' && body) {
            const nonce = String(body.nonce)
            if (!this.challenges.delete(nonce)) {
                return error(401, 'invalid_challenge')
            }
            const accessClientId = String(body.accessClientId)
            const client = this.clients.get(accessClientId)
            if (!client) {
                return await this.refusal(
                    'unknown_access_client',
                    accessClientId,
                    body.clientNonce
                )
            }
            const valid = verifyLocalSessionChallenge(
                client.signingKey,
                {
                    controllerId: this.controllerId,
                    accessClientId,
                    nonce: bytes(nonce),
                },
                bytes(body.signature)
            )
            if (!valid) return error(401, 'bad_signature')
            const session = b64urlEncode(
                crypto.getRandomValues(new Uint8Array(32))
            )
            this.sessions.set(session, accessClientId)
            return {
                status: 201,
                body: { session, expiresInSeconds: 600 },
            }
        }

        // Everything else needs a Local session.
        const session = request.authorization?.match(/^NemuSession (.+)$/)?.[1]
        const accessClientId = session ? this.sessions.get(session) : undefined
        if (!accessClientId || !this.clients.has(accessClientId)) {
            return error(401, 'local_session_invalid')
        }
        if (method === 'GET' && path === '/api/session') {
            return { status: 200, body: { role: 'owner' } }
        }
        if (method === 'GET' && path === '/api/devices') {
            return { status: 200, body: { devices: [] } }
        }
        return error(404, 'not_found')
    }
}
