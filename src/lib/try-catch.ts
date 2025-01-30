/** Attempts to execute a promise and returns an object with the result or error. */
export async function tryCatch<T>(promise: Promise<T>): Promise<{
    data?: T
    error?: Error
}> {
    try {
        const data = await promise

        return { data }
    } catch (error) {
        if (error instanceof Error) {
            return { error }
        }

        // Handle non-Error throws by wrapping them
        return { error: new Error(String(error)) }
    }
}
