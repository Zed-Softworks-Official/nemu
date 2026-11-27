import {
    ApiError,
    localSessionChallengeResponseSchema,
    openLocalSessionResponseSchema,
} from '@nemu/protocol'
import {
    b64urlDecode,
    b64urlEncode,
    signLocalSessionChallenge,
} from '@nemu/protocol/relay-crypto'
import {
    type AccessClientKeyStore,
    NOT_PAIRED_ERROR_CODE,
} from './access-client-keys.ts'
import { createControllerHttp } from './http.ts'

export { NOT_PAIRED_ERROR_CODE }

export type LocalSessionOptions = {
    baseUrl: string
    controllerId: string
    keyStore: AccessClientKeyStore
    /** Milliseconds; for tests. */
    now?: () => number
    /** Open a new Local session this long before the current one ends. */
    renewBeforeMs?: number
}

/**
 * The Access Client's Local session with one Home on the home network. It
 * signs a fresh Controller challenge to open one, reuses it, and renews it
 * before the Controller ends it (about ten minutes).
 */
export class LocalSession {
    private readonly http
    private readonly controllerId: string
    private readonly keyStore: AccessClientKeyStore
    private readonly now: () => number
    private readonly renewBeforeMs: number
    private current: { token: string; expiresAt: number } | null = null
    private opening: Promise<string> | null = null

    constructor(options: LocalSessionOptions) {
        this.http = createControllerHttp(options.baseUrl, () => null, 8_000)
        this.controllerId = options.controllerId
        this.keyStore = options.keyStore
        this.now = options.now ?? Date.now
        this.renewBeforeMs = options.renewBeforeMs ?? 60_000
    }

    /** A live Local session token, opening one when needed. */
    async token(): Promise<string> {
        if (
            this.current &&
            this.now() < this.current.expiresAt - this.renewBeforeMs
        ) {
            return this.current.token
        }
        this.opening ??= this.open().finally(() => {
            this.opening = null
        })
        return await this.opening
    }

    /** Forgets the session, after the Controller refused it. */
    invalidate(): void {
        this.current = null
    }

    private async open(): Promise<string> {
        const record = await this.keyStore.load(this.controllerId)
        if (!record) {
            throw new ApiError(
                NOT_PAIRED_ERROR_CODE,
                'This device is not paired with this Home. Pair it again at home.'
            )
        }
        const { accessClientId } = record.enrollment
        const started = this.now()
        const { data: challenge } = await this.http.post(
            '/api/local-sessions/challenge'
        )
        const { nonce } = localSessionChallengeResponseSchema.parse(challenge)
        const nonceBytes = b64urlDecode(nonce)
        if (!nonceBytes) {
            throw new ApiError('protocol_mismatch', 'Malformed challenge')
        }
        const signature = await signLocalSessionChallenge(record.keys.signer, {
            controllerId: this.controllerId,
            accessClientId,
            nonce: nonceBytes,
        })
        const { data } = await this.http.post('/api/local-sessions', {
            accessClientId,
            nonce,
            signature: b64urlEncode(signature),
        })
        const opened = openLocalSessionResponseSchema.parse(data)
        this.current = {
            token: opened.session,
            expiresAt: started + opened.expiresInSeconds * 1000,
        }
        return opened.session
    }
}
