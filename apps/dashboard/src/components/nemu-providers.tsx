'use client'

import { useAuth } from '@clerk/nextjs'
import {
    api,
    ConvexProviderWithClerk,
    ConvexReactClient,
    useQuery,
} from '@nemu/cloud'
import {
    ControllerProvider,
    lanDiscoveryCandidates,
    lanUrlsFromHostnames,
} from '@nemu/controller'
import { useMemo } from 'react'

import { env } from '~/env'

const convex = new ConvexReactClient(
    env.NEXT_PUBLIC_CONVEX_URL.replace(/\/$/, '')
)

const relayApi = {
    send: api.relay.send,
    responses: api.relay.responses,
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
            convex={convex}
            lanCandidates={lanCandidates}
            relayApi={relayApi}
        >
            {props.children}
        </ControllerProvider>
    )
}
