import { ApiError, apiErrorBodySchema } from '@nemu/protocol'
import axios, {
    type AxiosInstance,
    type InternalAxiosRequestConfig,
    isAxiosError,
} from 'axios'

export type GetToken = () => string | null

/** A Local session source; see `LocalSession`. */
export type LocalSessionAuth = {
    token(): Promise<string>
    invalidate(): void
}

/** The Controller ended or does not know the Local session. */
const LOCAL_SESSION_INVALID = 'local_session_invalid'

type RetriedConfig = InternalAxiosRequestConfig & { localSessionRetried?: true }

/**
 * HTTP to a LAN Controller. With `localSession`, requests carry
 * `Authorization: NemuSession`, and a refused session is renewed and the
 * request sent once more. Otherwise a bearer token from `getToken`, until
 * NEM-131 removes them.
 */
export function createControllerHttp(
    baseUrl: string,
    getToken: GetToken,
    timeoutMs = 5_000,
    localSession?: LocalSessionAuth
): AxiosInstance {
    const client = axios.create({
        baseURL: baseUrl.replace(/\/$/, ''),
        timeout: timeoutMs,
        headers: { Accept: 'application/json' },
    })

    client.interceptors.request.use(async (config) => {
        if (localSession) {
            config.headers.Authorization = `NemuSession ${await localSession.token()}`
            return config
        }
        const token = getToken()
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
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
                error.code === LOCAL_SESSION_INVALID
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
