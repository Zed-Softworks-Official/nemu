import {
    ApiError,
    localSessionChallengeResponseSchema,
    type OpenLocalSessionRequest,
    openLocalSessionResponseSchema,
} from '@nemu/protocol'
import {
    b64urlDecode,
    b64urlEncode,
    LOCAL_SESSION_NONCE_LENGTH,
    signLocalSessionChallenge,
    verifyLanRefusal,
} from '@nemu/protocol/relay-crypto'
import { z } from 'zod'
import {
    type AccessClientEnrollment,
    type AccessClientKeyStore,
    NOT_PAIRED_ERROR_CODE,
    SignedRefusal,
} from './access-client-keys.ts'
import { createControllerHttp, toApiError } from './http.ts'

/** Local session refusals the Controller signs over the client's nonce. */
const SIGNED_REFUSAL_CODES: ReadonlySet<string> = new Set([
    'unknown_access_client',
    'tombstoned_access_client',
])

const refusalDetailsSchema = z.object({ refusalSignature: z.string() })

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
        this.http = createControllerHttp(options.baseUrl, { timeoutMs: 8_000 })
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
        const clientNonce = crypto.getRandomValues(
            new Uint8Array(LOCAL_SESSION_NONCE_LENGTH)
        )
        let data: unknown
        try {
            const body: OpenLocalSessionRequest = {
                accessClientId,
                nonce,
                signature: b64urlEncode(signature),
                clientNonce: b64urlEncode(clientNonce),
            }
            ;({ data } = await this.http.post('/api/local-sessions', body))
        } catch (error) {
            throw verifiedRefusal(
                toApiError(error),
                record.enrollment,
                clientNonce
            )
        }
        const opened = openLocalSessionResponseSchema.parse(data)
        this.current = {
            token: opened.session,
            expiresAt: started + opened.expiresInSeconds * 1000,
        }
        return opened.session
    }
}

/**
 * The refusal as a `SignedRefusal` when the pinned Controller key signed it
 * over `clientNonce`; otherwise the error as it came, which drops no keys.
 */
function verifiedRefusal(
    error: ApiError,
    enrollment: AccessClientEnrollment,
    clientNonce: Uint8Array
): ApiError {
    if (!SIGNED_REFUSAL_CODES.has(error.code)) return error
    const details = refusalDetailsSchema.safeParse(error.details)
    const signature = details.success
        ? b64urlDecode(details.data.refusalSignature)
        : null
    if (
        signature?.length !== 64 ||
        !verifyLanRefusal(
            enrollment.controllerSigningKey,
            {
                controllerId: enrollment.controllerId,
                accessClientId: enrollment.accessClientId,
                code: error.code,
                clientNonce,
            },
            signature
        )
    ) {
        return error
    }
    return new SignedRefusal(error.code, error.message, error.status)
}
