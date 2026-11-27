'use client'

import { useAuth } from '@clerk/nextjs'
import {
    api,
    ConvexProviderWithClerk,
    ConvexReactClient,
    useConvexAuth,
    useQuery,
} from '@nemu/cloud'
import {
    ControllerProvider,
    lanDiscoveryCandidates,
    lanUrlsFromHostnames,
    type RelayApi,
} from '@nemu/controller'
import { useMemo } from 'react'

import { env } from '~/env'
import { dashboardKeyStore } from '~/lib/access-client-keys'

const convex = new ConvexReactClient(
    env.NEXT_PUBLIC_CONVEX_URL.replace(/\/$/, '')
)

// Sealed envelopes only (ADR-0001): RelayTransport seals every request with
// this browser's Access Client keys.
const relayApi: RelayApi = {
    send: api.relay.send,
    responses: api.relay.responses,
    acknowledge: api.relay.acknowledge,
    membership: api.relay.membership,
}

export function NemuProvider(props: { children: React.ReactNode }) {
    return (
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <PairedControllerProvider>
                {props.children}
            </PairedControllerProvider>
        </ConvexProviderWithClerk>
    )
}

function PairedControllerProvider(props: { children: React.ReactNode }) {
    const { isSignedIn } = useAuth()
    const { isAuthenticated } = useConvexAuth()
    const mine = useQuery(api.controllers.listMine, isSignedIn ? {} : 'skip')
    const lanCandidates = useMemo(
        () =>
            lanDiscoveryCandidates(
                lanUrlsFromHostnames((mine ?? []).map((row) => row.lanHostname))
            ),
        [mine]
    )

    return (
        <ControllerProvider
            accessClientKeyStore={dashboardKeyStore}
            convex={convex}
            lanCandidates={lanCandidates}
            relayAllowed={isAuthenticated}
            relayApi={relayApi}
        >
            {props.children}
        </ControllerProvider>
    )
}
