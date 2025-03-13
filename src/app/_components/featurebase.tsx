'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'

// Define types for Featurebase
interface FeaturebaseUser {
    organization: string
    email?: string
    name?: string
    id: string
    profilePicture?: string
    userHash: string
}

type FeaturebaseCallback = (error: Error | null) => void

interface FeaturebaseFunction {
    (method: 'identify', user: FeaturebaseUser, callback: FeaturebaseCallback): void
    q?: unknown[]
}

interface WindowWithFeaturebase extends Window {
    Featurebase: FeaturebaseFunction
}

export function Featurebase() {
    const { isSignedIn, user } = useUser()

    useEffect(() => {
        if (!isSignedIn || !user) return
        if (typeof window === 'undefined') return
        if (user.publicMetadata.role === 'admin') return

        const win = window as unknown as WindowWithFeaturebase

        // Skip Featurebase initialization in development environment
        if (win.location.hostname.includes('localhost')) {
            console.log(
                '[Featurebase] Skipping initialization in development environment'
            )

            return
        }

        // Initialize Featurebase if it doesn't exist
        if (typeof win.Featurebase !== 'function') {
            win.Featurebase = function () {
                // eslint-disable-next-line prefer-rest-params
                ;(win.Featurebase.q = win.Featurebase.q ?? []).push(arguments)
            } as FeaturebaseFunction
        }

        fetch('/api/featurebase', { method: 'POST' })
            .then((res) => res.json())
            .then((value: { user_hash: string }) => {
                win.Featurebase(
                    'identify',
                    {
                        organization: 'Nemu',
                        name: user.username ?? undefined,
                        id: user.id,
                        profilePicture: user.imageUrl,
                        userHash: value.user_hash
                    },
                    (err: Error | null) => {
                        if (err) {
                            console.log('[Featurebase] Error identifying user', err)
                        }
                    }
                )
            })
            .catch((err) => {
                console.log('[Featurebase] Error Fetching User Hash', err)
            })
    }, [isSignedIn, user])

    return (
        <Script
            src="https://do.featurebase.app/js/sdk.js"
            id="featurebase-sdk"
            strategy="afterInteractive"
        />
    )
}
