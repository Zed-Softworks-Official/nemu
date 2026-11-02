import { ApiError, type IdentifyResponse } from '@nemu/protocol'
import type { ProbeResult } from './discovery.ts'
import { WRONG_HOME_ERROR_CODE } from './pairing.ts'
import {
    type ControllerCredentialStore,
    createMemoryCredentialStore,
} from './storage.ts'

export type PairingHome = {
    controllerId: string
    name: string
}

export type PairingMethod = 'lan' | 'relay'

export type PairingFailureReason =
    /** The Controller rejected the six-digit code. */
    | 'invalid_code'
    /** The LAN Controller that answered is a different Home. */
    | 'wrong_home'
    /** No Membership yet and the Home is not on this network (ADR-0020). */
    | 'not_on_home_network'
    /** Neither LAN nor Relay reached the Home. */
    | 'unreachable'
    | 'unknown'

export type AccessClientPairingState =
    | { phase: 'idle' }
    | { phase: 'discovering' }
    | {
          phase: 'awaitingCode'
          baseUrl: string
          controllerName: string
          /** A Member can skip the code and pair over Relay instead. */
          canUseRelay: boolean
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
    /** The Account already holds a Membership in this Home. */
    isMember: boolean
    /** LAN addresses for this Home only. */
    lanCandidates: string[]
    /** Where the paired credential is kept. */
    credentialStore: ControllerCredentialStore
    discover: (candidates: string[]) => Promise<ProbeResult | null>
    identify: (baseUrl: string) => Promise<IdentifyResponse>
    /**
     * Exchange a code on LAN (`pairWithController`). Writes the credential
     * to `staging`; it is only kept if pairing is not cancelled.
     */
    pairOnLan: (
        baseUrl: string,
        code: string,
        staging: ControllerCredentialStore
    ) => Promise<void>
    /** Mint a session over Relay (`mintSessionViaRelay`) for a Member. */
    mintOverRelay?: (staging: ControllerCredentialStore) => Promise<void>
    /** Record the cloud Membership routing projection after LAN pairing. */
    recordMembership?: (controllerId: string) => Promise<void>
}

export type AccessClientPairing = {
    getState(): AccessClientPairingState
    subscribe(listener: (state: AccessClientPairingState) => void): () => void
    /** Look for this Home on LAN, else pair a Member over Relay. */
    start(): Promise<void>
    submitCode(code: string): Promise<void>
    /** From `awaitingCode`, pair a Member over Relay instead. */
    pairOverRelay(): Promise<void>
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
        'Join this Home’s Wi-Fi network to pair. Accepting a Home invitation requires being on its network.',
    unreachable:
        'Could not reach this Home on the local network or over the internet. Check that the Controller is on and try again.',
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
        if (err.code === 'network_error' || err.code === 'timeout') {
            return failure(
                'unreachable',
                'Lost the connection to the Controller while pairing. Stay on the Home network and try again.'
            )
        }
    }
    return failure('unknown', errorMessage(err))
}

function relayFailure(err: unknown): AccessClientPairingState {
    // `mintSessionViaRelay` times out when the Controller never answers.
    if (err instanceof Error && /timed out/i.test(err.message)) {
        return failure('unreachable')
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
        method: PairingMethod,
        run: (staging: ControllerCredentialStore) => Promise<void>
    ): Promise<void> {
        set({ phase: 'pairing', method })
        const staging = createMemoryCredentialStore()
        try {
            await run(staging)
        } catch (err) {
            if (!current(id)) return
            set(method === 'lan' ? lanFailure(err) : relayFailure(err))
            return
        }
        if (!current(id)) return

        const credential = staging.get(home.controllerId)
        if (!credential) {
            set(failure('wrong_home'))
            return
        }

        if (method === 'lan' && options.recordMembership) {
            try {
                await options.recordMembership(home.controllerId)
            } catch (err) {
                if (current(id)) set(failure('unknown', errorMessage(err)))
                return
            }
            if (!current(id)) return
        }

        options.credentialStore.set(home.controllerId, credential)
        set({ phase: 'paired', controllerId: home.controllerId, method })
    }

    async function relay(id: number): Promise<void> {
        const mint = options.mintOverRelay
        if (!options.isMember || !mint) {
            set(failure('not_on_home_network'))
            return
        }
        await finish(id, 'relay', mint)
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
                        canUseRelay:
                            options.isMember && !!options.mintOverRelay,
                    })
                    return
                }
                wrongHome = true
            } catch {
                if (!current(id)) return
            }
        }

        if (options.isMember && options.mintOverRelay) {
            await relay(id)
            return
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
            await finish(id, 'lan', (staging) =>
                options.pairOnLan(baseUrl, code.trim(), staging)
            )
        },
        async pairOverRelay() {
            if (state.phase !== 'awaitingCode') return
            await relay(++attempt)
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
