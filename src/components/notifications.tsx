'use client'

import {
    KnockProvider,
    useKnockClient,
    useNotifications,
    useNotificationStore
} from '@knocklabs/react'

import { useUser } from '@clerk/nextjs'

import { env } from '~/env'
import { Skeleton } from '~/components/ui/skeleton'
import { useEffect } from 'react'
import { Button } from '~/components/ui/button'
import { BellIcon } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import Link from 'next/link'
import { cn } from '~/lib/utils'

type Feed = ReturnType<typeof useNotifications>

export function Notifications() {
    const { user, isLoaded } = useUser()

    if (!isLoaded) {
        return <Skeleton className="h-12 w-12 rounded-full" />
    }

    if (!user?.id) {
        return null
    }

    return (
        <KnockProvider apiKey={env.NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY} userId={user?.id}>
            <NotificationFeed />
        </KnockProvider>
    )
}

function NotificationFeed() {
    const knock_client = useKnockClient()
    const feed_client = useNotifications(knock_client, env.NEXT_PUBLIC_KNOCK_FEED_ID)
    const { items, metadata } = useNotificationStore(feed_client)

    useFetchNotifications(feed_client)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={'ghost'}
                    size={'icon'}
                    className="relative rounded-full focus-visible:ring-0"
                >
                    <BellIcon className="size-4" />
                    <span className="sr-only">Notifications</span>
                    {metadata?.unread_count !== 0 && (
                        <div className="absolute right-0 top-0 size-2 rounded-full bg-primary"></div>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="flex max-h-[500px] max-w-[300px] flex-col gap-2 overflow-y-auto"
            >
                <DropdownMenuGroup className="flex items-center justify-between">
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    <Button
                        variant={'ghost'}
                        size={'sm'}
                        className="text-muted-foreground"
                        onClick={() => {
                            void feed_client.markAllAsRead()
                        }}
                    >
                        Mark all as Read
                    </Button>
                </DropdownMenuGroup>

                {items.map((item) => (
                    <DropdownMenuItem
                        key={item.id}
                        className="flex flex-col items-start gap-2"
                    >
                        {item.blocks.map((block) => (
                            <div
                                key={block.name}
                                onClick={() => {
                                    if (item.read_at) return

                                    void feed_client.markAsRead(item)
                                }}
                            >
                                {(block.type === 'markdown' || block.type === 'text') && (
                                    <div
                                        className={cn(
                                            item.read_at && 'text-muted-foreground'
                                        )}
                                        dangerouslySetInnerHTML={{
                                            __html: block.rendered
                                        }}
                                    />
                                )}
                                {block.type === 'button_set' && (
                                    <div>
                                        {block.buttons.map((button) => (
                                            <Button key={button.name} size={'sm'} asChild>
                                                <Link href={button.action}>
                                                    {button.label}
                                                </Link>
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function useFetchNotifications(feed_client: Feed) {
    useEffect(() => {
        void feed_client.fetch()
    }, [feed_client])
}
