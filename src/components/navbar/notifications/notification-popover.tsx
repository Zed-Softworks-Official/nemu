'use client'

import { useState, useRef } from 'react'
import {
    KnockProvider,
    KnockFeedProvider,
    NotificationIconButton,
    NotificationFeedPopover
} from '@knocklabs/react'

import { env } from '~/env'
import { useTheme } from 'next-themes'
// import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
// import { Button } from '~/components/ui/button'
// import { BellIcon, InfoIcon } from 'lucide-react'

import '@knocklabs/react/dist/index.css'

export default function NotificationPopover(props: { user_id: string }) {
    const theme = useTheme()
    const [isVisible, setIsVisiable] = useState(false)
    const notifButtonRef = useRef(null)

    return (
        <KnockProvider
            apiKey={env.NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY}
            userId={props.user_id}
        >
            <KnockFeedProvider
                feedId={env.NEXT_PUBLIC_KNOCK_FEED_ID}
                colorMode={theme.resolvedTheme === 'dark' ? 'dark' : 'light'}
            >
                <div>
                    <NotificationIconButton
                        ref={notifButtonRef}
                        onClick={() => setIsVisiable(!isVisible)}
                    />
                    <NotificationFeedPopover
                        buttonRef={notifButtonRef}
                        isVisible={isVisible}
                        onClose={() => setIsVisiable(false)}
                    />
                </div>
                {/* <FeedPopover /> */}
            </KnockFeedProvider>
        </KnockProvider>
    )
}
