import {
    ApiError,
    type IdentifyResponse,
    TOMBSTONED_ACCESS_CLIENT_ERROR_CODE,
} from '@nemu/protocol'
import {
    type AccessClientKeyStore,
    stageAccessClientKeys,
} from './access-client-keys.ts'
import type { ProbeResult } from './discovery.ts'
import { INVALID_GRANT_ERROR_CODE, WRONG_HOME_ERROR_CODE } from './pairing.ts'

export type PairingHome = {
    controllerId: string
    name: string
}

/**
 * Pairing always runs on the home network: CPace keyed by the Pairing code
 * (ADR-0037). Relay never pairs a new Access Client.
 */
export type PairingMethod = 'lan'

export type PairingFailureReason =
    /** The Controller rejected the six-digit code, or was an impostor. */
    | 'invalid_code'
    /** The LAN Controller that answered is a different Home. */
    | 'wrong_home'
    /** The Home is not on this network; pairing needs it (ADR-0020). */
    | 'not_on_home_network'
    /** The Controller refused these keys: this Access Client was revoked. */
    | 'revoked'
    /** The Controller dropped off the network while pairing. */
    | 'unreachable'
    | 'unknown'

export type AccessClientPairingState =
    | { phase: 'idle' }
    | { phase: 'discovering' }
    | {
          phase: 'awaitingCode'
          baseUrl: string
          controllerName: string
      }
    | { phase: 'pairing'; method: PairingMethod }
    | { phase: 'paired'; controllerId: string; method: PairingMethod }
    | { phase: 'cancelled' }
    | {
          phase: 'failed'
          reason: PairingFailureReason
          message: string
      }

export type AccessClientPairingOptions = {
    home: PairingHome
    /** LAN addresses for this Home only. */
    lanCandidates: string[]
    /** Where the new Access Client keys and Access grant are kept. */
    keyStore: AccessClientKeyStore
    discover: (candidates: string[]) => Promise<ProbeResult | null>
    identify: (baseUrl: string) => Promise<IdentifyResponse>
    /**
     * Run CPace pairing on LAN (`pairWithController` with `keyStore:
     * staging`). The same exchange covers a new Access Client, accepting an
     * Invitation and first-Owner bootstrap. What it saves to `staging` is
     * kept only if pairing is not cancelled.
     */
    pairOnLan: (
        baseUrl: string,
        code: string,
        staging: AccessClientKeyStore
    ) => Promise<void>
    /** Record the cloud Membership routing projection after LAN pairing. */
    recordMembership?: (controllerId: string) => Promise<void>
}

export type AccessClientPairing = {
    getState(): AccessClientPairingState
    subscribe(listener: (state: AccessClientPairingState) => void): () => void
    /** Look for this Home on LAN. */
    start(): Promise<void>
    submitCode(code: string): Promise<void>
    /** Abandon in-flight work. Late results are discarded, not stored. */
    cancel(): void
    retry(): Promise<void>
}

const MESSAGES: Record<PairingFailureReason, string> = {
    invalid_code:
        'That code was not accepted. It may have expired or already been used. Get a new 6-digit code from the Controller and try again.',
    wrong_home:
        'The Controller on this network belongs to a different Home. Join the Wi-Fi network of the Home you selected.',
    not_on_home_network:
        'Pair at home: join this Home’s Wi-Fi network and try again. Pairing, and accepting an invitation, need the Home network.',
    revoked:
        'This Home no longer accepts this device. Get a new 6-digit code from the Controller and pair again at home.',
    unreachable:
        'Could not reach this Home on the local network. Check that the Controller is on and try again.',
    unknown: 'Pairing failed. Try again.',
}

function failure(
    reason: PairingFailureReason,
    message = MESSAGES[reason]
): AccessClientPairingState {
    return { phase: 'failed', reason, message }
}

function lanFailure(err: unknown): AccessClientPairingState {
    if (err instanceof ApiError) {
        if (err.code === 'invalid_code') return failure('invalid_code')
        if (err.code === WRONG_HOME_ERROR_CODE) return failure('wrong_home')
        if (err.code === TOMBSTONED_ACCESS_CLIENT_ERROR_CODE)
            return failure('revoked')
        if (err.code === INVALID_GRANT_ERROR_CODE) {
            return failure(
                'unknown',
                'The Controller answered with an Access grant that does not match this pairing. Try again.'
            )
        }
        if (err.code === 'network_error' || err.code === 'timeout') {
            return failure(
                'unreachable',
                'Lost the connection to the Controller while pairing. Stay on the Home network and try again.'
            )
        }
    }
    return failure('unknown', errorMessage(err))
}

function errorMessage(err: unknown): string {
    return err instanceof Error && err.message ? err.message : MESSAGES.unknown
}

/**
 * Access Client pairing for one selected Home, as a platform-free state
 * machine. Apps drive it from UI; the Controller stays the authority that
 * issues the credential.
 */
export function createAccessClientPairing(
    options: AccessClientPairingOptions
): AccessClientPairing {
    const { home } = options
    const listeners = new Set<(state: AccessClientPairingState) => void>()
    let state: AccessClientPairingState = { phase: 'idle' }
    let attempt = 0
    let lanBaseUrl: string | null = null

    const set = (next: AccessClientPairingState) => {
        state = next
        for (const listener of listeners) listener(next)
    }

    const current = (id: number) => id === attempt

    async function finish(
        id: number,
        run: (staging: AccessClientKeyStore) => Promise<void>
    ): Promise<void> {
        const method: PairingMethod = 'lan'
        set({ phase: 'pairing', method })
        const staging = stageAccessClientKeys(options.keyStore)
        try {
            await run(staging.store)
        } catch (err) {
            if (current(id)) set(lanFailure(err))
            return
        }
        if (!current(id)) return

        if (staging.staged()?.enrollment.controllerId !== home.controllerId) {
            set(failure('wrong_home'))
            return
        }

        if (options.recordMembership) {
            try {
                await options.recordMembership(home.controllerId)
            } catch (err) {
                if (current(id)) set(failure('unknown', errorMessage(err)))
                return
            }
            if (!current(id)) return
        }

        try {
            await staging.commit()
        } catch (err) {
            if (current(id)) set(failure('unknown', errorMessage(err)))
            return
        }
        if (!current(id)) return
        set({ phase: 'paired', controllerId: home.controllerId, method })
    }

    async function start(): Promise<void> {
        const id = ++attempt
        lanBaseUrl = null
        set({ phase: 'discovering' })

        let probe: ProbeResult | null = null
        try {
            probe = await options.discover(options.lanCandidates)
        } catch {
            probe = null
        }
        if (!current(id)) return

        let wrongHome = false
        if (probe) {
            try {
                const identity = await options.identify(probe.baseUrl)
                if (!current(id)) return
                if (identity.controllerId === home.controllerId) {
                    lanBaseUrl = probe.baseUrl
                    set({
                        phase: 'awaitingCode',
                        baseUrl: probe.baseUrl,
                        controllerName: identity.name,
                    })
                    return
                }
                wrongHome = true
            } catch {
                if (!current(id)) return
            }
        }

        set(failure(wrongHome ? 'wrong_home' : 'not_on_home_network'))
    }

    return {
        getState: () => state,
        subscribe(listener) {
            listeners.add(listener)
            listener(state)
            return () => {
                listeners.delete(listener)
            }
        },
        start,
        async submitCode(code) {
            const baseUrl = lanBaseUrl
            if (state.phase !== 'awaitingCode' || !baseUrl) return
            const id = ++attempt
            await finish(id, (staging) =>
                options.pairOnLan(baseUrl, code.trim(), staging)
            )
        },
        cancel() {
            if (state.phase === 'paired') return
            attempt += 1
            set({ phase: 'cancelled' })
        },
        async retry() {
            await start()
        },
    }
}
