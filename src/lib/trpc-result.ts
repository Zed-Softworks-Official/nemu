import type { TRPCError } from '@trpc/server'
import type { Result } from 'neverthrow'

type Success<T> = {
    ok: true
    data: T
    error: null
}

type Failure<E = TRPCError> = {
    ok: false
    error: E
    data: null
}

type TRPCResult<T, E = TRPCError> = Success<T> | Failure<E>

export function trpcResult<T, E = TRPCError>(result: Result<T, E>): TRPCResult<T, E> {
    if (result.isErr()) {
        return {
            ok: false,
            error: result.error,
            data: null
        }
    }

    return {
        ok: true,
        data: result.value,
        error: null
    }
}
