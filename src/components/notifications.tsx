'use client'

import Link from 'next/link'
import {
    KnockProvider,
    useKnockClient,
    useNotifications,
    useNotificationStore
} from '@knocklabs/react'
import type { FeedItem, FeedItemOrItems, Feed } from '@knocklabs/client'
import { useUser } from '@clerk/nextjs'
import { useEffect, useMemo, useState } from 'react'
import { Archive, BellIcon, Inbox } from 'lucide-react'

import { env } from '~/env'

import { Skeleton } from '~/components/ui/skeleton'
import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

import { cn } from '~/lib/utils'

type NotificationInbox = 'inbox' | 'archive'

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
    const knockClient = useKnockClient()
    const feedClient = useNotifications(knockClient, env.NEXT_PUBLIC_KNOCK_FEED_ID, {
        archived: 'include'
    })

    const { items, metadata } = useNotificationStore(feedClient)
    const [selectedTab, setSelectedTab] = useState<NotificationInbox>('inbox')

    const notificationCounts = useMemo(() => {
        return items.reduce(
            (acc, item) => ({
                count: acc.count + (item.archived_at ? 0 : 1),
                archived: acc.archived + (item.archived_at ? 1 : 0)
            }),
            { count: 0, archived: 0 }
        )
    }, [items])

    useFetchNotifications(feedClient)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={'ghost'}
                    size={'icon'}
                    className="relative rounded-full focus-visible:ring-0"
                    onClick={() => {
                        void feedClient.markAllAsRead()
                    }}
                >
                    <BellIcon className="size-4" />
                    <span className="sr-only">Notifications</span>
                    {metadata?.unread_count !== 0 && (
                        <div className="bg-primary absolute top-0 right-0 size-2 rounded-full"></div>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="flex max-h-[500px] min-h-[500px] max-w-[300px] min-w-[300px] flex-col gap-2 overflow-y-auto p-0"
            >
                <Tabs
                    defaultValue={selectedTab}
                    className="flex flex-grow flex-col"
                    onValueChange={(value) => setSelectedTab(value as NotificationInbox)}
                >
                    <TabsList className="bg-popover sticky top-0 z-10 flex w-full items-center justify-center">
                        <TabsTrigger
                            value="inbox"
                            className={cn(
                                'flex w-full items-center justify-center gap-2 rounded-none p-2 text-sm',
                                {
                                    'border-primary border-b-2': selectedTab === 'inbox',
                                    'text-muted-foreground border-b-2':
                                        selectedTab !== 'inbox'
                                }
                            )}
                        >
                            <Inbox className="size-4" />
                            Inbox
                        </TabsTrigger>
                        <TabsTrigger
                            value="archive"
                            className={cn(
                                'flex w-full items-center justify-center gap-2 rounded-none p-2 text-sm',
                                {
                                    'border-primary border-b-2':
                                        selectedTab === 'archive',
                                    'text-muted-foreground border-b-2':
                                        selectedTab !== 'archive'
                                }
                            )}
                        >
                            <Archive className="size-4" />
                            Archive
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent
                        value="inbox"
                        className="relative flex flex-grow flex-col"
                    >
                        {items
                            .filter((item) => !item.archived_at)
                            .map((item) => (
                                <NotificationItem
                                    key={item.id}
                                    item={item}
                                    feed_client={feedClient}
                                    onArchive={() => {
                                        void feedClient.markAsArchived(item)
                                    }}
                                />
                            ))}
                        {/*Check if inbox is empty*/}
                        {notificationCounts.count === 0 && (
                            <EmptyState
                                icon={<Inbox className="text-muted-foreground size-16" />}
                                message="No New Notifications"
                            />
                        )}
                        {notificationCounts.count > 0 && (
                            <div className="bg-popover bottom-0 flex flex-col items-center justify-center border-t-2">
                                <Button
                                    variant={'ghost'}
                                    className="text-muted-foreground w-full rounded-none"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        void feedClient.markAllAsArchived()
                                    }}
                                >
                                    <Archive className="size-4" />
                                    Archive All
                                </Button>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="archive" className="flex flex-grow flex-col">
                        {items
                            .filter((item) => item.archived_at)
                            .map((item) => (
                                <NotificationItem
                                    key={item.id}
                                    item={item}
                                    feed_client={feedClient}
                                />
                            ))}
                        {/*Check if inbox is empty*/}
                        {notificationCounts.archived === 0 && (
                            <EmptyState
                                icon={
                                    <Archive className="text-muted-foreground size-16" />
                                }
                                message="No Archived Notifications"
                            />
                        )}
                    </TabsContent>
                </Tabs>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function useFetchNotifications(feed_client: Feed) {
    useEffect(() => {
        void feed_client.fetch()
    }, [feed_client])
}

function EmptyState(props: { icon: React.ReactNode; message: string }) {
    return (
        <DropdownMenuGroup className="flex flex-1 flex-col items-center justify-center">
            <DropdownMenuLabel className="flex flex-1 flex-col items-center justify-center gap-5">
                {props.icon}
                {props.message}
            </DropdownMenuLabel>
        </DropdownMenuGroup>
    )
}

function NotificationItem(props: {
    item: FeedItem
    feed_client: Feed
    onArchive?: () => void
}) {
    return (
        <DropdownMenuItem
            className="border-muted flex items-center justify-center gap-2 rounded-none border-b-2"
            onClick={() => {
                void props.feed_client.markAsRead(props.item as FeedItemOrItems)
            }}
        >
            <div className="flex flex-col items-start gap-2">
                {props.item.blocks.map((block) => (
                    <div key={block.name}>
                        {(block.type === 'markdown' || block.type === 'text') && (
                            <div
                                className={cn(
                                    props.item.read_at && 'text-muted-foreground'
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
                                        <Link href={button.action}>{button.label}</Link>
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {props.onArchive && (
                <div className="flex flex-1 items-center justify-center">
                    <Button
                        variant={'ghost'}
                        size={'icon'}
                        className="text-muted-foreground"
                        onClick={(e) => {
                            if (!props.onArchive) return

                            props.onArchive()
                            e.stopPropagation()
                        }}
                    >
                        <span className="sr-only">Archive</span>
                        <Archive className="size-4" />
                    </Button>
                </div>
            )}
        </DropdownMenuItem>
    )
}
