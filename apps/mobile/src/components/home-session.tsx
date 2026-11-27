import type { ConvexReactClient } from '@nemu/cloud'
import {
    type AccessClientKeyStore,
    type AccessClientPairing,
    type AccessClientPairingState,
    type ControllerConnectors,
    ControllerProvider,
    createAccessClientPairing,
    discoverController,
    identifyController,
    lanDiscoveryCandidates,
    lanUrlsFromHostnames,
    type PairAgainReason,
    type RelayApi,
    useController,
} from '@nemu/controller'
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    useSyncExternalStore,
} from 'react'

import type { ActiveHomeStore } from '~/lib/secure-credential-store'

/** A Home this Account holds a Membership in (from `controllers.listMine`). */
export type MobileHome = {
    controllerId: string
    name: string
    lanHostname?: string
}

/**
 * Everything the Home session needs from the platform and the cloud.
 * Tests replace these with a fake Controller and in-memory stores.
 */
export type HomeSessionServices = {
    /** This phone's Access Client keys, one record per Home. */
    accessClientKeyStore: AccessClientKeyStore
    activeHomeStore: ActiveHomeStore
    /** Override Controller network access (tests only). */
    connectors?: Partial<ControllerConnectors>
    /**
     * CPace pairing on the home network (`pairWithController` with
     * `keyStore: staging`). It also accepts an Invitation, or makes the
     * first Owner of a new Controller.
     */
    pairOnLan: (
        home: MobileHome,
        baseUrl: string,
        code: string,
        staging: AccessClientKeyStore
    ) => Promise<void>
    recordMembership: (controllerId: string) => Promise<void>
}

export type HomeRoute = 'loading' | 'select-home' | 'pair' | 'app'

type HomeSessionValue = {
    homes: MobileHome[] | undefined
    activeHome: MobileHome | null
    paired: boolean
    route: HomeRoute
    selectHome: (controllerId: string) => void
    /** Return to Home selection. Credentials stay with their Home. */
    switchHome: () => void
    createPairing: (home: MobileHome) => AccessClientPairing
    /** Called after the person acknowledges a successful pairing. */
    completePairing: () => void
    /**
     * Drop this phone's Access Client keys for the active Home only. Does not
     * revoke on the Controller: Settings offers it on its own only as
     * "Forget on this phone" when the Controller is unreachable, and after
     * the Controller has confirmed a revocation or a Leave. `notice` is
     * shown on the pairing screen that follows.
     */
    forgetPairing: (notice?: string) => void
    /** Why this Home's pairing was cleared, when the phone should say so. */
    pairingNotice: string | null
}

const HomeSessionContext = createContext<HomeSessionValue | null>(null)

export function lanCandidatesForHome(home: MobileHome | null): string[] {
    if (!home) return []
    return lanDiscoveryCandidates(lanUrlsFromHostnames([home.lanHostname]))
}

type HomeSessionProviderProps = {
    /** `undefined` while the Home list is loading. */
    homes: MobileHome[] | undefined
    services: HomeSessionServices
    convex?: ConvexReactClient
    relayApi?: RelayApi
    relayAllowed?: boolean
    children: ReactNode
}

/**
 * Holds the active Home for this installation and scopes the shared
 * ControllerProvider to it: LAN discovery, Relay routing, and the Access
 * Client credential all belong to the selected Home (ADR-0008).
 */
export function HomeSessionProvider({
    homes,
    services,
    convex,
    relayApi,
    relayAllowed = true,
    children,
}: HomeSessionProviderProps) {
    const { accessClientKeyStore, activeHomeStore, connectors } = services
    const [selectedId, setSelectedId] = useState(() => activeHomeStore.get())
    // This session's own pairing change, which outranks the stored read.
    const [pairingChange, setPairingChange] = useState<{
        controllerId: string
        paired: boolean
        notice?: string
    } | null>(null)

    // Keep one object per Home value. The Home list reloads when pairing
    // records its Membership, and a new object would restart that pairing.
    const found = homes?.find((home) => home.controllerId === selectedId)
    const foundName = found?.name
    const foundLanHostname = found?.lanHostname
    const activeHome = useMemo<MobileHome | null>(
        () =>
            selectedId !== null && foundName !== undefined
                ? {
                      controllerId: selectedId,
                      name: foundName,
                      lanHostname: foundLanHostname,
                  }
                : null,
        [selectedId, foundName, foundLanHostname]
    )

    // Whether this phone holds keys for the active Home. Only keys count: a
    // bearer-token credential from before them is unpaired.
    const activeId = activeHome?.controllerId ?? null
    const [stored, setStored] = useState<{
        controllerId: string
        paired: boolean
    } | null>(null)
    useEffect(() => {
        if (!activeId) return
        let live = true
        const settle = (paired: boolean) => {
            if (live) setStored({ controllerId: activeId, paired })
        }
        accessClientKeyStore.load(activeId).then(
            (record) => settle(record !== null),
            () => settle(false)
        )
        return () => {
            live = false
        }
    }, [accessClientKeyStore, activeId])
    const storedPaired =
        stored && stored.controllerId === activeId ? stored.paired : null

    const ownChange =
        activeHome !== null &&
        pairingChange?.controllerId === activeHome.controllerId
            ? pairingChange
            : null
    const paired = ownChange ? ownChange.paired : storedPaired === true
    const pairingNotice =
        ownChange && !ownChange.paired ? (ownChange.notice ?? null) : null

    const route: HomeRoute =
        homes === undefined
            ? 'loading'
            : !activeHome
              ? 'select-home'
              : !ownChange && storedPaired === null
                ? 'loading'
                : paired
                  ? 'app'
                  : 'pair'

    const selectHome = useCallback(
        (controllerId: string) => {
            activeHomeStore.set(controllerId)
            setSelectedId(controllerId)
        },
        [activeHomeStore]
    )

    const switchHome = useCallback(() => {
        activeHomeStore.clear()
        setSelectedId(null)
    }, [activeHomeStore])

    const completePairing = useCallback(() => {
        if (!selectedId) return
        setPairingChange({ controllerId: selectedId, paired: true })
    }, [selectedId])

    const forgetPairing = useCallback(
        (notice?: string) => {
            if (!selectedId) return
            void accessClientKeyStore.clear(selectedId).catch(() => {})
            setPairingChange({
                controllerId: selectedId,
                paired: false,
                notice,
            })
        },
        [accessClientKeyStore, selectedId]
    )

    const createPairing = useCallback(
        (home: MobileHome) =>
            createAccessClientPairing({
                home,
                lanCandidates: lanCandidatesForHome(home),
                keyStore: accessClientKeyStore,
                discover: (candidates) =>
                    connectors?.discover
                        ? connectors.discover(candidates, null)
                        : discoverController(candidates, null),
                identify: (baseUrl) =>
                    connectors?.identify
                        ? connectors.identify(baseUrl)
                        : identifyController(baseUrl),
                pairOnLan: (baseUrl, code, staging) =>
                    services.pairOnLan(home, baseUrl, code, staging),
                recordMembership: services.recordMembership,
            }),
        [accessClientKeyStore, connectors, services]
    )

    const lanCandidates = useMemo(
        () => lanCandidatesForHome(activeHome),
        [activeHome]
    )

    const value = useMemo(
        () => ({
            homes,
            activeHome,
            paired,
            route,
            selectHome,
            switchHome,
            createPairing,
            completePairing,
            forgetPairing,
            pairingNotice,
        }),
        [
            homes,
            activeHome,
            paired,
            route,
            selectHome,
            switchHome,
            createPairing,
            completePairing,
            forgetPairing,
            pairingNotice,
        ]
    )

    return (
        <HomeSessionContext.Provider value={value}>
            <ControllerProvider
                accessClientKeyStore={accessClientKeyStore}
                // A new Home gets a new connection; nothing carries over.
                autoStart={paired}
                connectors={connectors}
                controllerId={activeHome?.controllerId ?? null}
                convex={convex}
                key={activeHome?.controllerId ?? 'no-home'}
                lanCandidates={lanCandidates}
                relayAllowed={relayAllowed}
                relayApi={relayApi}
            >
                {activeHome && paired ? (
                    <PairAgainWatcher
                        home={activeHome}
                        onLost={forgetPairing}
                    />
                ) : null}
                {children}
            </ControllerProvider>
        </HomeSessionContext.Provider>
    )
}

/** What the pairing screen says after this phone lost access to a Home. */
/** What each reason to pair again tells the person, for every reason. */
const PAIR_AGAIN_NOTICES: Record<
    PairAgainReason,
    (homeName: string) => string
> = {
    not_paired: (homeName) =>
        `This phone’s keys for ${homeName} are gone. Pair it again at home.`,
    bearer_token_retired: (homeName) =>
        `Nemu now pairs each phone with its own keys. Pair this phone again at home to keep using ${homeName}.`,
    unknown_access_client: (homeName) =>
        `This phone no longer has access to ${homeName}. It may have been removed. Pair it again at home.`,
    tombstoned_access_client: (homeName) =>
        `This phone was removed from ${homeName}. Pair it again at home.`,
    membership_ended: (homeName) =>
        `You are no longer a Member of ${homeName}. Ask an Owner for a new Invitation.`,
}

export function pairAgainNotice(
    reason: PairAgainReason,
    homeName: string
): string {
    return PAIR_AGAIN_NOTICES[reason](homeName)
}

/**
 * Sends the person to pairing, with the reason, when the Controller says
 * this phone must pair again: its keys are lost, or it was revoked.
 */
function PairAgainWatcher(props: {
    home: MobileHome
    onLost: (notice: string) => void
}) {
    const { pairingLoss } = useController()
    const { home, onLost } = props
    useEffect(() => {
        if (pairingLoss?.controllerId !== home.controllerId) return
        onLost(pairAgainNotice(pairingLoss.reason, home.name))
    }, [home, onLost, pairingLoss])
    return null
}

export function useHomeSession(): HomeSessionValue {
    const value = useContext(HomeSessionContext)
    if (!value) {
        throw new Error(
            'useHomeSession must be used within HomeSessionProvider'
        )
    }
    return value
}

/**
 * Pairing for the active Home. The session is cancelled when the screen
 * unmounts so late results are never stored.
 */
export function useAccessClientPairing(): {
    home: MobileHome | null
    state: AccessClientPairingState
    pairing: AccessClientPairing | null
} {
    const { activeHome, createPairing } = useHomeSession()
    const pairing = useMemo(
        () => (activeHome ? createPairing(activeHome) : null),
        [activeHome, createPairing]
    )

    useEffect(() => {
        if (!pairing) return
        return () => {
            if (pairing.getState().phase !== 'paired') pairing.cancel()
        }
    }, [pairing])

    const subscribe = useCallback(
        (onChange: () => void) => pairing?.subscribe(onChange) ?? (() => {}),
        [pairing]
    )
    const state = useSyncExternalStore(
        subscribe,
        () => pairing?.getState() ?? IDLE,
        () => pairing?.getState() ?? IDLE
    )

    return { home: activeHome, state, pairing }
}

const IDLE: AccessClientPairingState = { phase: 'idle' }
