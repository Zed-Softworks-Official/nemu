import 'server-only'

import { cache } from 'react'

import { headers, type UnsafeUnwrappedHeaders } from 'next/headers';
import { NextRequest } from 'next/server'

import { getAuth } from '@clerk/nextjs/server'

import { createCaller } from '~/server/api/root'
import { createTRPCContext } from '~/server/api/trpc'
import { env } from '~/env'

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const createContext = cache(() => {
    const heads = new Headers((headers() as unknown as UnsafeUnwrappedHeaders))
    heads.set('x-trpc-source', 'rsc')

    return createTRPCContext({
        headers: heads,
        auth: getAuth(new NextRequest(env.BASE_URL, { headers: (headers() as unknown as UnsafeUnwrappedHeaders) }))
    });
})

export const api = createCaller(createContext)
