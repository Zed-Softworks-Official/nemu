import type { ConvexReactClient } from 'convex/react'
import type { FunctionReference } from 'convex/server'

export type RelayAcknowledgeArgs = { messageIds: string[] }

export type RelayAcknowledgeRef = FunctionReference<
    'mutation',
    'public',
    RelayAcknowledgeArgs,
    unknown
>

/**
 * Deletes used Relay responses from Convex without waiting. A failure is
 * ignored: the backstop sweep removes the messages once they expire.
 */
export function acknowledgeRelayResponses(
    convex: ConvexReactClient,
    acknowledge: RelayAcknowledgeRef,
    messageIds: string[]
): void {
    if (messageIds.length === 0) return
    void Promise.resolve()
        .then(() => convex.mutation(acknowledge, { messageIds }))
        .catch(() => {})
}
