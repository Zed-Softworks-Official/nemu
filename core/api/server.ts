import { headers } from 'next/headers'
import { cache } from 'react'

import { createCaller } from '@/core/api/root'
import { createTRPCContext } from '@/core/api/trpc'

/**
 * This wraps the 'createTRPC' helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component
 */
const createContext = cache(() => {
    const heads = new Headers(headers())
    heads.set('x-trpc-source', 'rsc')

    return createTRPCContext({
        headers: heads
    })
})

export const api = createCaller(createContext)
