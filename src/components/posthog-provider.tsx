'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { env } from '~/env'

if (typeof window !== 'undefined') {
    posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: '/ingest',
        ui_host: 'https://us.posthog.com',
        person_profiles: 'identified_only'
    })
}

export default function PosthogProvider({ children }: { children: React.ReactNode }) {
    return (
        <PostHogProvider client={posthog}>
            <PosthogAuthProvider>{children}</PosthogAuthProvider>
        </PostHogProvider>
    )
}

function PosthogAuthProvider({ children }: { children: React.ReactNode }) {
    const auth = useAuth()
    const userInfo = useUser()

    useEffect(() => {
        if (userInfo.user) {
            posthog.identify(userInfo.user.id, {
                username: userInfo.user.username,
                role: userInfo.user.publicMetadata.role,
                handle: userInfo.user.publicMetadata.handle
            })
        } else if (!auth.isSignedIn) {
            posthog.reset()
        }
    }, [auth, userInfo])

    return children
}
