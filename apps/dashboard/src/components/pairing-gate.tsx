'use client'

import { api, useConvexAuth, useQuery } from '@nemu/cloud'
import { getClientToken, useController } from '@nemu/controller'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const PAIRING_CHECK_TIMEOUT_MS = 15_000

/**
 * Redirects signed-in users without a local client token (or Convex pairing)
 * into the setup wizard. Times out to /no-homes when checks never resolve.
 */
export function PairingGate(props: { children: React.ReactNode }) {
    const router = useRouter()
    const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
    const pairings = useQuery(api.pairings.list, isAuthenticated ? {} : 'skip')
    const { status } = useController()
    const [hasToken, setHasToken] = useState<boolean | null>(null)

    const isUnresolved =
        authLoading ||
        hasToken === null ||
        (isAuthenticated && pairings === undefined)

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

    useEffect(() => {
        if (!isUnresolved) return

        const timedOut = window.setTimeout(() => {
            router.replace('/no-homes')
        }, PAIRING_CHECK_TIMEOUT_MS)

        return () => {
            window.clearTimeout(timedOut)
        }
    }, [isUnresolved, router])

    // Early exit when LAN + relay are both down and we have no local token.
    // If a token exists, wait for the pairings query (or the timeout) so
    // already-paired users with an offline controller still enter the app.
    useEffect(() => {
        if (!isUnresolved) return
        if (status.mode !== 'offline') return
        if (authLoading || !isAuthenticated) return
        if (hasToken !== false) return
        router.replace('/no-homes')
    }, [
        authLoading,
        hasToken,
        isAuthenticated,
        isUnresolved,
        router,
        status.mode,
    ])

    if (isUnresolved) {
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
