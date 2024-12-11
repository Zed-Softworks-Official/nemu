'use client'

import { useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import {
    KnockProvider,
    KnockFeedProvider,
    NotificationIconButton,
    NotificationFeedPopover,
    type ColorMode
} from '@knocklabs/react'
import { useUser } from '@clerk/nextjs'

import { env } from '~/env'
import { Skeleton } from '~/components/ui/skeleton'

import '@knocklabs/react/dist/index.css'

export function Notifications() {
    const { user, isLoaded } = useUser()
    const theme = useTheme()

    const [isVisible, setIsVisible] = useState(false)
    const notifRefButton = useRef<HTMLButtonElement>(null)

    if (!isLoaded) {
        return <Skeleton className="h-12 w-12 rounded-full" />
    }

    if (!user?.id) {
        return null
    }

    return (
        <KnockProvider apiKey={env.NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY} userId={user?.id}>
            <KnockFeedProvider
                feedId={env.NEXT_PUBLIC_KNOCK_FEED_ID}
                colorMode={theme.resolvedTheme as ColorMode}
            >
                <>
                    <NotificationIconButton
                        ref={notifRefButton}
                        onClick={() => setIsVisible(!isVisible)}
                    />
                    <NotificationFeedPopover
                        buttonRef={notifRefButton}
                        isVisible={isVisible}
                        onClose={() => setIsVisible(false)}
                    />
                </>
            </KnockFeedProvider>
        </KnockProvider>
    )
}
