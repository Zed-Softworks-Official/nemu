type Success<T> = {
    data: T
    error: null
}

type Failure<E> = {
    data: null
    error: E
}

export type Result<T, E> = Success<T> | Failure<E>

export async function tryCatch<T, E>(promise: Promise<T>): Promise<Result<T, E>> {
    try {
        const data = await promise
        return { data, error: null }
    } catch (error) {
        return { data: null, error: error as E }
    }
}
