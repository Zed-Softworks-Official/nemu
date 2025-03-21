import * as Sentry from '@sentry/nextjs'

export function captureException<E = Error>(error: E) {
    Sentry.captureException(error)
}
