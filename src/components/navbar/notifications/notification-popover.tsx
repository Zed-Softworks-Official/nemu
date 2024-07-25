'use client'

import { KnockProvider, KnockFeedProvider, useKnockFeed } from '@knocklabs/react'

import { env } from '~/env'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Button } from '~/components/ui/button'
import { BellIcon, InfoIcon } from 'lucide-react'
import { useTheme } from 'next-themes'

import '@knocklabs/react/dist/index.css'

export default function NotificationPopover(props: { user_id: string }) {
    const theme = useTheme()

    return (
        <KnockProvider apiKey={env.NEXT_PUBLIC_KNOCK_API_KEY} userId={props.user_id}>
            <KnockFeedProvider
                feedId={env.NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY}
                colorMode={theme.resolvedTheme === 'dark' ? 'dark' : 'light'}
            >
                <FeedPopover />
            </KnockFeedProvider>
        </KnockProvider>
    )
}

function FeedPopover() {
    const knockFeed = useKnockFeed()

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" className="rounded-full">
                    <BellIcon className="h-6 w-6" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[400px] rounded-lg shadow-lg">
                <div className="flex flex-col p-4">
                    <div className="flex flex-col">
                        <h4 className="text-lg font-medium">Notifications</h4>
                        <div className="divider"></div>
                    </div>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-5 rounded-xl p-4 hover:bg-base-300">
                            <InfoIcon className="h-6 w-6" />
                            <div className="flex flex-col gap-2">
                                <h1 className="text-md font-bold">Congratulations!</h1>
                                <p className="text-sm text-base-content/80">
                                    You&apos;ve earned a new badge for being an Artist!
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
