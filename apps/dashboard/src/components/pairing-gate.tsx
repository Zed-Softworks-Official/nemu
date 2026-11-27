'use client'

import { api, useConvexAuth, useQuery } from '@nemu/cloud'
import {
    getRememberedControllerId,
    isLocalDevDashboard,
    useController,
} from '@nemu/controller'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { dashboardKeyStore } from '~/lib/access-client-keys'

const PAIRING_CHECK_TIMEOUT_MS = 15_000

/**
 * Lets the dashboard open only for a browser that holds Access Client keys
 * for its Home. Every other browser pairs on the home network in the setup
 * wizard: a new browser, an invitee, and one that only holds a bearer token
 * from before Access Client keys. A browser the Controller revoked, or whose
 * keys are gone, goes back to setup with the reason.
 */
export function PairingGate(props: { children: React.ReactNode }) {
    const router = useRouter()
    const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
    const pairings = useQuery(api.pairings.list, isAuthenticated ? {} : 'skip')
    const { status, pairingLoss } = useController()
    const [hasKeys, setHasKeys] = useState<boolean | null>(null)

    useEffect(() => {
        const controllerId = getRememberedControllerId()
        if (!controllerId) {
            setHasKeys(false)
            return
        }
        let live = true
        dashboardKeyStore.load(controllerId).then(
            (record) => {
                if (live) setHasKeys(record !== null)
            },
            () => {
                if (live) setHasKeys(false)
            }
        )
        return () => {
            live = false
        }
    }, [])

    const isUnresolved =
        authLoading ||
        hasKeys === null ||
        (isAuthenticated && pairings === undefined)

    useEffect(() => {
        if (!pairingLoss) return
        router.replace(`/setup?pairAgain=${pairingLoss.reason}`)
    }, [pairingLoss, router])

    useEffect(() => {
        if (authLoading || !isAuthenticated || pairingLoss) return
        if (hasKeys === null || pairings === undefined) return
        if (hasKeys && pairings.length > 0) return
        router.replace('/setup')
    }, [authLoading, hasKeys, isAuthenticated, pairingLoss, pairings, router])

    useEffect(() => {
        if (authLoading || !isAuthenticated) return
        if (pairings === undefined || status.mode !== 'lan') return
        if (!status.controllerId || !isLocalDevDashboard()) return
        const pairedHere = pairings.some(
            (row) => row.controllerId === status.controllerId
        )
        if (!pairedHere) {
            router.replace('/setup')
        }
    }, [authLoading, isAuthenticated, pairings, router, status])

    useEffect(() => {
        if (!isUnresolved) return
        const timedOut = window.setTimeout(() => {
            router.replace('/no-homes')
        }, PAIRING_CHECK_TIMEOUT_MS)
        return () => {
            window.clearTimeout(timedOut)
        }
    }, [isUnresolved, router])

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

    if (
        pairingLoss ||
        !hasKeys ||
        pairings === undefined ||
        pairings.length === 0
    ) {
        return (
            <div className="flex min-h-svh items-center justify-center text-muted-foreground text-sm">
                Redirecting to setup…
            </div>
        )
    }

    return props.children
}
