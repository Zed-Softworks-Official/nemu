'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, loggerLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'

import React, { useState } from 'react'
import { AppRouter } from './root'
import SuperJson from 'superjson'

const createQueryClient = () => new QueryClient()

let clientQueryClientSingleton: QueryClient | undefined = undefined
const getQueryClient = () => {
    if (typeof window === 'undefined') {
        // Server: always make a new query client
        return createQueryClient()
    }
    // Browser: use singleton pattern to keep the same query client
    return (clientQueryClientSingleton ??= createQueryClient())
}

export const api = createTRPCReact<AppRouter>()

export default function TRPCProvider({ children }: { children: React.ReactNode }) {
    const queryClient = getQueryClient()
    const [trpcClient] = useState(() =>
        api.createClient({
            links: [
                loggerLink({
                    enabled: (op) =>
                        process.env.NODE_ENV === 'development' ||
                        (op.direction === 'down' && op.result instanceof Error)
                }),
                httpBatchLink({
                    url: getBaseUrl() + '/api/trpc',
                    
                })
            ],
            transformer: SuperJson
        })
    )

    return (
        <api.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </api.Provider>
    )
}

function getBaseUrl() {
    if (typeof window !== 'undefined') return window.location.origin
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    return `http://localhost:${process.env.PORT ?? 3000}`
}
