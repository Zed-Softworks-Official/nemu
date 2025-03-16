import type { TRPCError } from '@trpc/server'
import type { Result } from 'neverthrow'

/**
 * Error result returned when the Result is an error
 */
type ErrorResult = {
    isOk: false
    formatted: false
    error: TRPCError
}

/**
 * Success result when no formatted data is provided
 */
type SuccessResult<T> = {
    isOk: true
    formatted: false
    value: T
}

/**
 * Success result when formatted data is provided
 */
type SuccessResultFormatted<T> = {
    isOk: true
    formatted: true
    value: T
}

/**
 * Union type for all possible result types
 */
export type TRPCResultType<T, TFormatted = undefined> =
    | ErrorResult
    | (TFormatted extends undefined ? SuccessResult<T> : never)
    | (TFormatted extends undefined ? never : SuccessResultFormatted<TFormatted>)

/**
 * Creates a strongly-typed result object from a neverthrow Result
 *
 * @param data Object containing the Result and optional formatted data
 * @returns A discriminated union with isOk and formatted flags for type narrowing
 */
export function tRPCResult<T, TFormatted = undefined>(data: {
    result: Result<T, TRPCError>
    formattedData?: TFormatted
}): TRPCResultType<T, TFormatted> {
    if (data.result.isErr()) {
        return {
            isOk: false,
            formatted: false,
            error: data.result.error
        } as ErrorResult
    }

    // If formattedData exists and is not undefined, return formatted success result
    if (data.formattedData !== undefined) {
        return {
            isOk: true,
            formatted: true,
            value: data.formattedData
        } as SuccessResultFormatted<TFormatted> as TRPCResultType<T, TFormatted>
    }

    // Otherwise return standard success result with original value
    return {
        isOk: true,
        formatted: false,
        value: data.result.value
    } as SuccessResult<T> as TRPCResultType<T, TFormatted>
}
