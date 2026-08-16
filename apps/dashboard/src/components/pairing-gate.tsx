'use client'

import { useUser } from '@clerk/nextjs'
import { api, useConvex, useConvexAuth, useQuery } from '@nemu/cloud'
import {
    getClientToken,
    mintSessionViaRelay,
    useController,
} from '@nemu/controller'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const PAIRING_CHECK_TIMEOUT_MS = 15_000

function defaultClientLabel(): string {
    if (typeof navigator !== 'undefined') {
        return `${navigator.platform || 'Browser'} dashboard`
    }
    return 'Dashboard'
}

/**
 * Redirects signed-in users without a local client token (or Convex pairing)
 * into the setup wizard. Known members/invitees mint a session instead of
 * re-entering a pairing code.
 */
export function PairingGate(props: { children: React.ReactNode }) {
    const router = useRouter()
    const convex = useConvex()
    const { user, isLoaded: userLoaded } = useUser()
    const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
    const pairings = useQuery(api.pairings.list, isAuthenticated ? {} : 'skip')
    const invites = useQuery(
        api.invites.listMine,
        isAuthenticated ? {} : 'skip'
    )
    const { status } = useController()
    const [hasToken, setHasToken] = useState<boolean | null>(null)
    const [mintError, setMintError] = useState<string | null>(null)
    const minting = useRef(false)

    const controllerId =
        pairings?.[0]?.controllerId ?? invites?.[0]?.controllerId ?? null
    const hasCloudLink =
        (pairings !== undefined && pairings.length > 0) ||
        (invites !== undefined && invites.length > 0)

    const isUnresolved =
        authLoading ||
        hasToken === null ||
        (isAuthenticated &&
            (pairings === undefined || invites === undefined)) ||
        (isAuthenticated && hasCloudLink && hasToken === false && !mintError)

    useEffect(() => {
        setHasToken(Boolean(getClientToken()))
    }, [])

    useEffect(() => {
        if (authLoading || !isAuthenticated) return
        if (
            hasToken === null ||
            pairings === undefined ||
            invites === undefined
        )
            return
        if (hasToken) return
        if (hasCloudLink) return
        router.replace('/setup')
    }, [
        authLoading,
        hasCloudLink,
        hasToken,
        invites,
        isAuthenticated,
        pairings,
        router,
    ])

    useEffect(() => {
        if (authLoading || !isAuthenticated) return
        if (hasToken !== false) return
        if (!hasCloudLink || !controllerId) return
        if (minting.current || mintError) return
        if (!userLoaded) return

        const email = user?.primaryEmailAddress?.emailAddress
        if (!email) {
            setMintError(
                'This Google account did not share an email address. Invite the address on the account you actually use.'
            )
            return
        }

        minting.current = true
        void mintSessionViaRelay({
            convex,
            api: {
                request: api.sessionMints.request,
                responses: api.relay.responses,
            },
            controllerId,
            clientLabel: defaultClientLabel(),
            displayName: user.fullName ?? undefined,
        })
            .then(() => {
                setHasToken(true)
                setMintError(null)
            })
            .catch((err: unknown) => {
                setMintError(
                    err instanceof Error
                        ? err.message
                        : 'Could not create a dashboard session'
                )
            })
            .finally(() => {
                minting.current = false
            })
    }, [
        authLoading,
        controllerId,
        convex,
        hasCloudLink,
        hasToken,
        isAuthenticated,
        mintError,
        user?.fullName,
        user?.primaryEmailAddress?.emailAddress,
        userLoaded,
    ])

    useEffect(() => {
        if (!isUnresolved) return
        if (hasCloudLink && hasToken === false && !mintError) return

        const timedOut = window.setTimeout(() => {
            router.replace('/no-homes')
        }, PAIRING_CHECK_TIMEOUT_MS)

        return () => {
            window.clearTimeout(timedOut)
        }
    }, [hasCloudLink, hasToken, isUnresolved, mintError, router])

    useEffect(() => {
        if (!isUnresolved) return
        if (status.mode !== 'offline') return
        if (authLoading || !isAuthenticated) return
        if (hasToken !== false) return
        if (hasCloudLink) return
        router.replace('/no-homes')
    }, [
        authLoading,
        hasCloudLink,
        hasToken,
        isAuthenticated,
        isUnresolved,
        router,
        status.mode,
    ])

    if (mintError) {
        return (
            <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-destructive text-sm" role="alert">
                    {mintError}
                </p>
                <p className="text-muted-foreground text-xs">
                    Sign in with the Google account that was invited, or ask the
                    owner to invite this email.
                </p>
            </div>
        )
    }

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
