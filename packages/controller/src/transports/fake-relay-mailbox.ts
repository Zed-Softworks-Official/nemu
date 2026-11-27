import {
    b64urlEncode,
    EMPTY_REPLAY_WINDOW,
    ed25519PublicKey,
    ed25519Signer,
    type MembershipProjection,
    openRequest,
    pushHeaderFor,
    RelayCryptoError,
    type RelayRejection,
    type ReplayWindow,
    type RequestHeader,
    type RequestKeys,
    replyKeys,
    responseHeaderFor,
    type SealedPush,
    type SealedRequest,
    type SealedResponse,
    type SignedMembershipProjection,
    sealPush,
    sealResponse,
    signMembershipProjection,
    utf8Decode,
    utf8Encode,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'
import type { ConvexReactClient } from 'convex/react'
import {
    type AccessClientKeyStore,
    type AccessClientRecord,
    accessClientKeysFromSecrets,
    createMemoryAccessClientKeyStore,
} from '../access-client-keys.ts'
import type { RelayApi } from './relay.ts'

/**
 * Seam 3 (NEM-63 spec): Convex's Relay mailbox with a Controller behind it,
 * for `RelayTransport` tests. The Controller side opens every sealed request
 * with the real `@nemu/protocol/relay-crypto` checks (Home, epoch, expiry,
 * Access Client, signature, replay window), answers it, and seals and signs
 * the reply, as Core's Relay handler does. Refused requests are answered the
 * way Core answers them. A `watchCapabilityChanges` it acknowledges
 * becomes a live watch, which `push` seals capability events to under the
 * watch's exported key and next counter, as Core's push loop does.
 */

export const FAKE_RELAY_API = {
    send: 'relay:send',
    responses: 'relay:responses',
    acknowledge: 'relay:acknowledge',
    membership: 'relay:membership',
} as unknown as RelayApi

export const FAKE_HOME_ID = 'nemu_00000000feedbeef'
export const FAKE_ACCESS_CLIENT_ID = '11111111-2222-4333-8444-555555555555'

type Stored =
    | { _id: string; kind: 'response'; sealed: SealedResponse }
    | { _id: string; kind: 'push'; sealed: SealedPush }

/** A capability watch the Controller holds, as Core does. */
type FakeWatch = { header: RequestHeader; keys: RequestKeys; counter: number }

export type FakeAnswer = (
    message: { type: string } & Record<string, unknown>,
    header: RequestHeader
) => unknown | undefined

export type FakeRelayMailboxOptions = {
    /** The reply plaintext, or `undefined` to leave the request unanswered. */
    answer?: FakeAnswer
    /** The Controller's current identity epoch. */
    identityEpoch?: number
    connected?: boolean
}

export class FakeRelayMailbox {
    readonly controllerSigningSecret = new Uint8Array(32).fill(7)
    readonly controllerEncryptionSecret = new Uint8Array(32).fill(8)
    readonly keyStore: AccessClientKeyStore = createMemoryAccessClientKeyStore()
    /** What crossed Convex, exactly as Convex stored it. */
    readonly wire: SealedRequest[] = []
    /** Actions the Controller opened, in order. */
    readonly opened: Array<{ type: string } & Record<string, unknown>> = []
    readonly acks: string[][] = []
    /** The requestIds of each `relay:responses` query, in order. */
    readonly queried: string[][] = []
    readonly stored: Stored[] = []
    identityEpoch: number
    connected: boolean
    window: ReplayWindow = EMPTY_REPLAY_WINDOW
    /** Whether the Access Client is still paired; otherwise `unknown`. */
    paired = true
    /** Rewrites a reply before Convex stores it (an attacker in the cloud). */
    tamper: ((sealed: SealedResponse) => SealedResponse) | null = null
    /** Signs replies with another key (an impostor Controller). */
    impostor = false
    failAcknowledge = false
    /**
     * The signed Membership routing projection Convex holds for this
     * Access Client's Membership (NEM-133), or none. Convex routes `send`
     * on it: without an active one, `send` is refused with `no_membership`.
     */
    projection: SignedMembershipProjection | null = null
    /** Reads of `relay:membership`, by Membership ID. */
    readonly membershipReads: string[] = []
    answer: FakeAnswer
    /** Live capability watches, oldest first. */
    readonly watches: FakeWatch[] = []
    private nextId = 0
    private pending: Array<{
        header: RequestHeader
        keys: RequestKeys
        message: { type: string } & Record<string, unknown>
    }> = []

    constructor(options: FakeRelayMailboxOptions = {}) {
        this.answer = options.answer ?? (() => undefined)
        this.identityEpoch = options.identityEpoch ?? 1
        this.connected = options.connected ?? true
    }

    get controllerSigningKey(): Uint8Array {
        return ed25519PublicKey(this.controllerSigningSecret)
    }

    /** Pairs one Access Client, pinning this Controller's keys. */
    async pair(enrollment: Partial<AccessClientRecord['enrollment']> = {}) {
        const keys = accessClientKeysFromSecrets(
            new Uint8Array(32).fill(1),
            new Uint8Array(32).fill(2)
        )
        await this.keyStore.save({
            keys,
            enrollment: {
                controllerId: FAKE_HOME_ID,
                accessClientId: FAKE_ACCESS_CLIENT_ID,
                membershipId: 'membership-1',
                grant: 'grant',
                controllerSigningKey: this.controllerSigningKey,
                controllerEncryptionKey: x25519PublicKey(
                    this.controllerEncryptionSecret
                ),
                ...enrollment,
            },
        })
        return keys
    }

    /**
     * Publishes a signed projection for the paired Membership, as Core's
     * outbox does, signed by the Controller (or the impostor key).
     */
    async publishMembership(
        overrides: Partial<MembershipProjection> = {},
        { impostor = false }: { impostor?: boolean } = {}
    ): Promise<SignedMembershipProjection> {
        const signed = await signMembershipProjection(
            {
                controllerId: FAKE_HOME_ID,
                identityEpoch: this.identityEpoch,
                membershipId: 'membership-1',
                accountId: 'user-1',
                state: 'active',
                sequence: (this.projection?.projection.sequence ?? 0) + 1,
                ...overrides,
            },
            ed25519Signer(
                impostor
                    ? new Uint8Array(32).fill(9)
                    : this.controllerSigningSecret
            )
        )
        this.projection = signed
        return signed
    }

    /** Answers a request left unanswered. */
    async respond(requestId: string, reply: unknown): Promise<string> {
        const index = this.pending.findIndex(
            (p) => p.header.requestId === requestId
        )
        const pending = this.pending[index]
        if (!pending) throw new Error(`no pending request ${requestId}`)
        this.pending.splice(index, 1)
        this.registerWatch(pending.message, pending.header, pending.keys, reply)
        return await this.store(pending.header, pending.keys, reply)
    }

    /** Request IDs of the live watches, oldest first. */
    watchRequestIds(): string[] {
        return this.watches.map((w) => w.header.requestId)
    }

    /**
     * Seals `event` once per live watch, under each watch's key and next
     * counter, and stores the pushes. Returns their message IDs.
     */
    async push(event: unknown): Promise<string[]> {
        const ids: string[] = []
        for (const watch of this.watches) {
            ids.push(this.deliver(await this.sealPush(event, watch)))
        }
        return ids
    }

    /**
     * Seals `event` on one watch (the newest by default) without storing it,
     * taking its next counter unless `counter` is given.
     */
    async sealPush(
        event: unknown,
        watch: FakeWatch | string | undefined = this.watches.at(-1),
        counter?: number
    ): Promise<SealedPush> {
        const target =
            typeof watch === 'string'
                ? this.watches.find((w) => w.header.requestId === watch)
                : watch
        if (!target) throw new Error('no live watch')
        if (counter === undefined) {
            target.counter += 1
        }
        return await sealPush({
            watch: target.header,
            keys: target.keys,
            counter: counter ?? target.counter,
            plaintext: utf8Encode(JSON.stringify(event)),
            controllerSigner: ed25519Signer(
                this.impostor
                    ? new Uint8Array(32).fill(9)
                    : this.controllerSigningSecret
            ),
        })
    }

    /** Stores a sealed push, as Core's `respondAsController` would. */
    deliver(sealed: SealedPush): string {
        const _id = `msg-${this.nextId++}`
        this.stored.push({ _id, kind: 'push', sealed: structuredClone(sealed) })
        return _id
    }

    /** A push Convex made up on the newest watch: right header, junk bytes. */
    forgePush(counter: number): string {
        const watch = this.watches.at(-1)
        if (!watch) throw new Error('no live watch')
        return this.deliver({
            header: pushHeaderFor(watch.header, counter),
            ciphertext: b64urlEncode(new Uint8Array(40).fill(3)),
            signature: b64urlEncode(new Uint8Array(64).fill(4)),
        })
    }

    /** Pushes still in the mailbox. */
    storedPushes(): SealedPush[] {
        return this.stored.flatMap((m) => (m.kind === 'push' ? [m.sealed] : []))
    }

    /**
     * Revokes the Access Client: its watches end at once, and its requests
     * are refused from now on.
     */
    revoke(): void {
        this.paired = false
        this.watches.length = 0
    }

    private registerWatch(
        message: { type: string } & Record<string, unknown>,
        header: RequestHeader,
        keys: RequestKeys,
        reply: unknown
    ): void {
        if (message.type !== 'watchCapabilityChanges') return
        if (
            (reply as { type?: string } | null)?.type !== 'capabilityWatchAck'
        ) {
            return
        }
        const renews = message.renews
        for (let i = this.watches.length - 1; i >= 0; i--) {
            const id = this.watches[i]?.header.requestId
            if (id === renews || id === header.requestId) {
                this.watches.splice(i, 1)
            }
        }
        this.watches.push({ header, keys, counter: 0 })
    }

    /**
     * Stores a reply Convex made up for a pending request: right header,
     * bytes it could not have sealed or signed.
     */
    forge(requestId: string): string {
        const pending = this.pending.find(
            (p) => p.header.requestId === requestId
        )
        if (!pending) throw new Error(`no pending request ${requestId}`)
        const _id = `msg-${this.nextId++}`
        this.stored.push({
            _id,
            kind: 'response',
            sealed: {
                header: responseHeaderFor(pending.header),
                ciphertext: b64urlEncode(new Uint8Array(40).fill(3)),
                signature: b64urlEncode(new Uint8Array(64).fill(4)),
            },
        })
        return _id
    }

    pendingRequestIds(): string[] {
        return this.pending.map((p) => p.header.requestId)
    }

    readonly convex = {
        connectionState: () => ({ isWebSocketConnected: this.connected }),
        mutation: async (ref: unknown, args: Record<string, unknown>) => {
            if (ref === FAKE_RELAY_API.acknowledge) {
                const messageIds = args.messageIds as string[]
                this.acks.push(messageIds)
                if (this.failAcknowledge) throw new Error('offline')
                for (const id of messageIds) {
                    const index = this.stored.findIndex((m) => m._id === id)
                    if (index >= 0) this.stored.splice(index, 1)
                }
                return null
            }
            if (ref !== FAKE_RELAY_API.send) throw new Error('unknown ref')
            if (!this.connected) return await new Promise(() => {})
            if (this.projection?.projection.state === 'ended') {
                // As Convex refuses an Account without an active Membership.
                throw Object.assign(new Error('no_membership'), {
                    data: { code: 'no_membership' },
                })
            }
            const sealed = args.sealed as SealedRequest
            // Convex keeps nothing but the sealed envelope.
            this.wire.push(structuredClone(sealed))
            await this.controller(sealed)
            return `request-${this.wire.length}`
        },
        query: async (
            ref: unknown,
            args: {
                controllerId: string
                accessClientId: string
                membershipId: string
                requestIds: string[]
            }
        ) => {
            if (ref === FAKE_RELAY_API.membership) {
                this.membershipReads.push(args.membershipId)
                const held = this.projection
                return held &&
                    held.projection.controllerId === args.controllerId &&
                    held.projection.membershipId === args.membershipId
                    ? structuredClone(held)
                    : null
            }
            if (ref !== FAKE_RELAY_API.responses) throw new Error('unknown ref')
            this.queried.push([...args.requestIds])
            return this.stored.filter(
                (m) =>
                    m.sealed.header.controllerId === args.controllerId &&
                    m.sealed.header.accessClientId === args.accessClientId &&
                    args.requestIds.includes(m.sealed.header.requestId)
            )
        },
    } as unknown as ConvexReactClient

    private async controller(sealed: SealedRequest): Promise<void> {
        const record = await this.keyStore.load(FAKE_HOME_ID)
        let opened: ReturnType<typeof openRequest>
        try {
            opened = openRequest({
                sealed,
                controllerEncryptionSecret: this.controllerEncryptionSecret,
                policy: {
                    controllerId: FAKE_HOME_ID,
                    identityEpoch: this.identityEpoch,
                    nowMs: Date.now(),
                },
                lookup: (id) =>
                    this.paired &&
                    record &&
                    id === record.enrollment.accessClientId
                        ? {
                              status: 'active',
                              signingKey: record.keys.signingKey,
                          }
                        : { status: 'unknown' },
                window: this.window,
            })
        } catch (error) {
            if (!(error instanceof RelayCryptoError)) throw error
            const reply = this.refusal(error.code)
            if (!reply) return
            const keys = replyKeys({
                sealed,
                controllerEncryptionSecret: this.controllerEncryptionSecret,
            })
            await this.store(sealed.header, keys, reply)
            return
        }
        this.window = opened.window
        const message = JSON.parse(utf8Decode(opened.plaintext) ?? 'null')
        this.opened.push(message)
        const reply = this.answer(message, opened.header)
        this.registerWatch(message, opened.header, opened.keys, reply)
        if (reply === undefined) {
            this.pending.push({
                header: opened.header,
                keys: opened.keys,
                message,
            })
            return
        }
        await this.store(opened.header, opened.keys, reply)
    }

    /** Core's answer to a request refused before decryption. */
    private refusal(code: RelayRejection): unknown | undefined {
        const error = (
            errorCode: string,
            details?: Record<string, unknown>
        ) => ({
            type: 'commandResult',
            ok: false,
            error: { code: errorCode, message: errorCode, details },
        })
        switch (code) {
            case 'retired_epoch':
                return error('retired_epoch', {
                    identityEpoch: this.identityEpoch,
                })
            case 'replayed':
            case 'outside_window':
                return error(code, { highestCounter: this.window.highest })
            case 'expired':
                return error('request_expired')
            case 'unknown_access_client':
            case 'tombstoned_access_client':
            case 'bad_signature':
                return error(code)
            default:
                return undefined
        }
    }

    private async store(
        header: RequestHeader,
        keys: RequestKeys,
        reply: unknown
    ): Promise<string> {
        const signer = ed25519Signer(
            this.impostor
                ? new Uint8Array(32).fill(9)
                : this.controllerSigningSecret
        )
        let sealed = await sealResponse({
            request: header,
            keys,
            plaintext: utf8Encode(JSON.stringify(reply)),
            controllerSigner: signer,
        })
        if (this.tamper) sealed = this.tamper(sealed)
        const _id = `msg-${this.nextId++}`
        this.stored.push({ _id, kind: 'response', sealed })
        return _id
    }
}
