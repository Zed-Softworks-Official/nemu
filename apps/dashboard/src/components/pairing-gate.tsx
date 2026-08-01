'use client'

import { api, useConvexAuth, useQuery } from '@nemu/cloud'
import { getClientToken } from '@nemu/controller'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Redirects signed-in users without a local client token (or Convex pairing)
 * into the setup wizard.
 */
export function PairingGate(props: { children: React.ReactNode }) {
    const router = useRouter()
    const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
    const pairings = useQuery(api.pairings.list, isAuthenticated ? {} : 'skip')
    const [hasToken, setHasToken] = useState<boolean | null>(null)

    useEffect(() => {
        setHasToken(Boolean(getClientToken()))
    }, [])

    useEffect(() => {
        if (authLoading || !isAuthenticated) return
        if (hasToken === null || pairings === undefined) return
        if (!hasToken || pairings.length === 0) {
            router.replace('/setup')
        }
    }, [authLoading, hasToken, isAuthenticated, pairings, router])

    if (
        authLoading ||
        hasToken === null ||
        (isAuthenticated && pairings === undefined)
    ) {
        return (
            <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
                Checking controller pairing…
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
                Signing in…
            </div>
        )
    }

    if (!hasToken || pairings === undefined || pairings.length === 0) {
        return (
            <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
                Redirecting to setup…
            </div>
        )
    }

    return props.children
}
