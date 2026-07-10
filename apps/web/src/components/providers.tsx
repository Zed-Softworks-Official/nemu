'use client'

import { useAuth } from '@clerk/nextjs'
import { api } from '@nemu/cloud'
import { ControllerProvider } from '@nemu/controller'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import type { ReactNode } from 'react'
import { env } from '~/env'

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL)

const relayApi = {
    send: api.relay.send,
    responses: api.relay.responses,
}

export function Providers({ children }: { children: ReactNode }) {
    return (
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <ControllerProvider convex={convex} relayApi={relayApi}>
                {children}
            </ControllerProvider>
        </ConvexProviderWithClerk>
    )
}
