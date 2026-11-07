import { useAuth, useUser } from '@clerk/expo'
import {
    api,
    ConvexProviderWithClerk,
    ConvexReactClient,
    useConvexAuth,
    useQuery,
} from '@nemu/cloud'
import { mintSessionViaRelay, pairWithController } from '@nemu/controller'
import * as Device from 'expo-device'
import { useEffect, useMemo, useRef } from 'react'

import {
    HomeSessionProvider,
    type HomeSessionServices,
    type MobileHome,
} from '~/components/home-session'
import { env } from '~/env'
import {
    createSecureActiveHomeStore,
    createSecureCredentialStore,
    createSecureHomeListStore,
} from '~/lib/secure-credential-store'

const convex = new ConvexReactClient(
    env.EXPO_PUBLIC_CONVEX_URL.replace(/\/$/, '')
)

const relayApi = {
    send: api.relay.send,
    responses: api.relay.responses,
}

const sessionMintApi = {
    request: api.sessionMints.request,
    responses: api.relay.responses,
}

function clientLabel(): string {
    return Device.deviceName ?? Device.modelName ?? 'Nemu mobile'
}

export function NemuProvider(props: { children: React.ReactNode }) {
    return (
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <AccountHomeSession>{props.children}</AccountHomeSession>
        </ConvexProviderWithClerk>
    )
}

function AccountHomeSession(props: { children: React.ReactNode }) {
    const { userId } = useAuth()
    const accountId = userId ?? 'signed-out'
    return (
        // Stores and the connection belong to one Account.
        <AccountHomes accountId={accountId} key={accountId}>
            {props.children}
        </AccountHomes>
    )
}

function AccountHomes(props: { accountId: string; children: React.ReactNode }) {
    const { accountId } = props
    const { isAuthenticated } = useConvexAuth()
    const { user } = useUser()
    // Read at pairing time. A changed user object must not restart pairing.
    const userRef = useRef(user)
    userRef.current = user

    const homeListStore = useMemo(
        () => createSecureHomeListStore(accountId),
        [accountId]
    )
    const mine = useQuery(
        api.controllers.listMine,
        isAuthenticated ? {} : 'skip'
    )
    const liveHomes = useMemo<MobileHome[] | undefined>(
        () =>
            mine?.map((row) => ({
                controllerId: row.controllerId,
                name: row.name,
                lanHostname: row.lanHostname,
            })),
        [mine]
    )
    useEffect(() => {
        if (liveHomes) homeListStore.set(liveHomes)
    }, [homeListStore, liveHomes])
    const homes = useMemo(
        () => liveHomes ?? homeListStore.get() ?? undefined,
        [homeListStore, liveHomes]
    )

    const services = useMemo<HomeSessionServices>(
        () => ({
            credentialStore: createSecureCredentialStore(accountId),
            activeHomeStore: createSecureActiveHomeStore(accountId),
            pairOnLan: async (home, baseUrl, code, staging) => {
                const current = userRef.current
                const email = current?.primaryEmailAddress?.emailAddress
                if (!current || !email) {
                    throw new Error(
                        'This account did not share an email address, so it cannot be paired.'
                    )
                }
                await pairWithController(baseUrl, {
                    code,
                    clientLabel: clientLabel(),
                    userId: current.id,
                    email,
                    displayName: current.fullName ?? undefined,
                    expectedControllerId: home.controllerId,
                    credentialStore: staging,
                })
            },
            mintOverRelay: async (home, staging) => {
                // Convex would hold the request until reconnect.
                if (!convex.connectionState().isWebSocketConnected) {
                    throw new Error('Timed out: not connected to the Relay')
                }
                await mintSessionViaRelay({
                    convex,
                    api: sessionMintApi,
                    controllerId: home.controllerId,
                    clientLabel: clientLabel(),
                    displayName: userRef.current?.fullName ?? undefined,
                    credentialStore: staging,
                })
            },
            recordMembership: async (controllerId) => {
                // Selectable Homes already have this record. LAN pairing must
                // finish with no internet, so do not wait for the cloud.
                void convex
                    .mutation(api.pairings.create, { controllerId })
                    .catch(() => {})
            },
        }),
        [accountId]
    )

    return (
        <HomeSessionProvider
            convex={convex}
            homes={homes}
            relayAllowed={isAuthenticated}
            relayApi={relayApi}
            services={services}
        >
            {props.children}
        </HomeSessionProvider>
    )
}
