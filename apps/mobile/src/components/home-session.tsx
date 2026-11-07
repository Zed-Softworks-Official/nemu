import type { ConvexReactClient } from '@nemu/cloud'
import {
    type AccessClientPairing,
    type AccessClientPairingState,
    type ControllerConnectors,
    type ControllerCredentialStore,
    ControllerProvider,
    createAccessClientPairing,
    discoverController,
    identifyController,
    lanDiscoveryCandidates,
    lanUrlsFromHostnames,
    type RelayApi,
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
    credentialStore: ControllerCredentialStore
    activeHomeStore: ActiveHomeStore
    /** Override Controller network access (tests only). */
    connectors?: Partial<ControllerConnectors>
    pairOnLan: (
        home: MobileHome,
        baseUrl: string,
        code: string,
        staging: ControllerCredentialStore
    ) => Promise<void>
    mintOverRelay: (
        home: MobileHome,
        staging: ControllerCredentialStore
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
    const { credentialStore, activeHomeStore, connectors } = services
    const [selectedId, setSelectedId] = useState(() => activeHomeStore.get())
    // Bumped when this installation's credential for a Home changes.
    const [credentialVersion, setCredentialVersion] = useState(0)

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

    const paired = useMemo(
        () =>
            activeHome
                ? credentialStore.get(activeHome.controllerId) !== null
                : false,
        [activeHome, credentialStore, credentialVersion]
    )

    const route: HomeRoute =
        homes === undefined
            ? 'loading'
            : !activeHome
              ? 'select-home'
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
        setCredentialVersion((version) => version + 1)
    }, [])

    const createPairing = useCallback(
        (home: MobileHome) =>
            createAccessClientPairing({
                home,
                isMember: true,
                lanCandidates: lanCandidatesForHome(home),
                credentialStore,
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
                mintOverRelay: (staging) =>
                    services.mintOverRelay(home, staging),
                recordMembership: services.recordMembership,
            }),
        [credentialStore, connectors, services]
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
        ]
    )

    return (
        <HomeSessionContext.Provider value={value}>
            <ControllerProvider
                // A new Home gets a new connection; nothing carries over.
                autoStart={paired}
                connectors={connectors}
                controllerId={activeHome?.controllerId ?? null}
                convex={convex}
                credentialStore={credentialStore}
                key={activeHome?.controllerId ?? 'no-home'}
                lanCandidates={lanCandidates}
                relayAllowed={relayAllowed}
                relayApi={relayApi}
            >
                {children}
            </ControllerProvider>
        </HomeSessionContext.Provider>
    )
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
