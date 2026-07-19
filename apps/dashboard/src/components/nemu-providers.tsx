'use client'

import { useAuth } from '@clerk/nextjs'
import { api, ConvexProviderWithClerk, ConvexReactClient } from '@nemu/cloud'
import { ControllerProvider } from '@nemu/controller'

import { env } from '~/env'

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL)

const relayApi = {
    send: api.relay.send,
    responses: api.relay.responses,
}

export function NemuProvider(props: { children: React.ReactNode }) {
    return (
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <ControllerProvider convex={convex} relayApi={relayApi}>
                {props.children}
            </ControllerProvider>
        </ConvexProviderWithClerk>
    )
}
