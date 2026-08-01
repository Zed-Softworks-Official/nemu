'use client'

import { api, useQuery } from '@nemu/cloud'
import { getClientToken } from '@nemu/controller'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Redirects signed-in users without a local client token (or Convex pairing)
 * into the setup wizard.
 */
export function PairingGate(props: { children: React.ReactNode }) {
    const router = useRouter()
    const pairings = useQuery(api.pairings.list)
    const [hasToken, setHasToken] = useState<boolean | null>(null)

    useEffect(() => {
        setHasToken(Boolean(getClientToken()))
    }, [])

    useEffect(() => {
        if (hasToken === null || pairings === undefined) return
        if (!hasToken || pairings.length === 0) {
            router.replace('/setup')
        }
    }, [hasToken, pairings, router])

    if (hasToken === null || pairings === undefined) {
        return (
            <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
                Checking controller pairing…
            </div>
        )
    }

    if (!hasToken || pairings.length === 0) {
        return (
            <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
                Redirecting to setup…
            </div>
        )
    }

    return props.children
}
