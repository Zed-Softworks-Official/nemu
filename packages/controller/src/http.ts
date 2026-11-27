import {
    ApiError,
    apiErrorBodySchema,
    TOMBSTONED_ACCESS_CLIENT_ERROR_CODE,
    UNKNOWN_ACCESS_CLIENT_ERROR_CODE,
} from '@nemu/protocol'
import axios, {
    type AxiosInstance,
    type InternalAxiosRequestConfig,
    isAxiosError,
} from 'axios'

/** A Local session source; see `LocalSession`. */
export type LocalSessionAuth = {
    token(): Promise<string>
    invalidate(): void
}

/**
 * The Controller ended or does not know the Local session, or refused its
 * Access Client on a request. Opening a new session either works or brings
 * the refusal signed (`LocalSession`), so it is tried once.
 */
const RENEW_SESSION_ON: ReadonlySet<string> = new Set([
    'local_session_invalid',
    UNKNOWN_ACCESS_CLIENT_ERROR_CODE,
    TOMBSTONED_ACCESS_CLIENT_ERROR_CODE,
])

type RetriedConfig = InternalAxiosRequestConfig & { localSessionRetried?: true }

export type ControllerHttpOptions = {
    timeoutMs?: number
    localSession?: LocalSessionAuth
}

/**
 * HTTP to a LAN Controller. With `localSession`, requests carry
 * `Authorization: NemuSession`, and a refused session is renewed and the
 * request sent once more. Without it, requests carry no credential: only
 * public routes (identify, health, pairing) answer.
 */
export function createControllerHttp(
    baseUrl: string,
    { timeoutMs = 5_000, localSession }: ControllerHttpOptions = {}
): AxiosInstance {
    const client = axios.create({
        baseURL: baseUrl.replace(/\/$/, ''),
        timeout: timeoutMs,
        headers: { Accept: 'application/json' },
    })

    client.interceptors.request.use(async (config) => {
        if (localSession) {
            config.headers.Authorization = `NemuSession ${await localSession.token()}`
        }
        return config
    })

    client.interceptors.response.use(
        (res) => res,
        async (err: unknown) => {
            const error = toApiError(err)
            const config = isAxiosError(err)
                ? (err.config as RetriedConfig | undefined)
                : undefined
            if (
                localSession &&
                config &&
                !config.localSessionRetried &&
                RENEW_SESSION_ON.has(error.code)
            ) {
                localSession.invalidate()
                config.localSessionRetried = true
                return await client.request(config)
            }
            throw error
        }
    )

    return client
}

export function toApiError(err: unknown): ApiError {
    if (err instanceof ApiError) return err

    if (isAxiosError(err)) {
        const status = err.response?.status
        const data = err.response?.data
        const parsed = apiErrorBodySchema.safeParse(data)
        if (parsed.success) {
            return new ApiError(
                parsed.data.error.code,
                parsed.data.error.message,
                status,
                parsed.data.error.details
            )
        }
        if (err.code === 'ECONNABORTED') {
            return new ApiError('timeout', 'Request timed out', status)
        }
        if (!err.response) {
            return new ApiError(
                'network_error',
                err.message || 'Network error',
                status
            )
        }
        return new ApiError(
            'http_error',
            err.message || `HTTP ${status ?? 'error'}`,
            status
        )
    }

    if (err instanceof Error) {
        return new ApiError('unknown', err.message)
    }
    return new ApiError('unknown', 'Unknown error')
}
