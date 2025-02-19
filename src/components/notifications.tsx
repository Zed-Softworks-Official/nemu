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
import { useEffect, useMemo } from 'react'
import { Button } from '~/components/ui/button'
import { Archive, BellIcon, Inbox } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { useState } from 'react'

type Feed = ReturnType<typeof useNotifications>
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
    const knock_client = useKnockClient()
    const feed_client = useNotifications(knock_client, env.NEXT_PUBLIC_KNOCK_FEED_ID, {
        archived: 'include'
    })
    const { items, metadata } = useNotificationStore(feed_client)
    const [selectedTab, setSelectedTab] = useState<NotificationInbox>('inbox')

    const itemsInInbox = useMemo(() => {
        return items.filter((item) => !item.archived_at).length
    }, [items])

    const itemsInArchive = useMemo(() => {
        return items.filter((item) => item.archived_at).length
    }, [items])

    useFetchNotifications(feed_client)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={'ghost'}
                    size={'icon'}
                    className="relative rounded-full focus-visible:ring-0"
                    onClick={() => {
                        void feed_client.markAllAsRead()
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
                                <DropdownMenuItem
                                    key={item.id}
                                    className="border-muted flex items-start gap-2 rounded-none border-b-2"
                                    onClick={() => {
                                        void feed_client.markAsRead(item)
                                    }}
                                >
                                    <div className="flex flex-col items-start gap-2">
                                        {item.blocks.map((block) => (
                                            <div key={block.name}>
                                                {(block.type === 'markdown' ||
                                                    block.type === 'text') && (
                                                    <div
                                                        className={cn(
                                                            item.read_at &&
                                                                'text-muted-foreground'
                                                        )}
                                                        dangerouslySetInnerHTML={{
                                                            __html: block.rendered
                                                        }}
                                                    />
                                                )}
                                                {block.type === 'button_set' && (
                                                    <div>
                                                        {block.buttons.map((button) => (
                                                            <Button
                                                                key={button.name}
                                                                size={'sm'}
                                                                asChild
                                                            >
                                                                <Link
                                                                    href={button.action}
                                                                >
                                                                    {button.label}
                                                                </Link>
                                                            </Button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-1 items-center justify-center">
                                        <Button
                                            variant={'ghost'}
                                            size={'icon'}
                                            className="text-muted-foreground"
                                            onClick={(e) => {
                                                void feed_client.markAsArchived(item)
                                                e.stopPropagation()
                                            }}
                                        >
                                            <span className="sr-only">Archive</span>
                                            <Archive className="size-4" />
                                        </Button>
                                    </div>
                                </DropdownMenuItem>
                            ))}
                        {/*Check if inbox is empty*/}
                        {itemsInInbox === 0 && (
                            <DropdownMenuGroup className="flex flex-1 flex-col items-center justify-center">
                                <DropdownMenuLabel className="flex flex-1 flex-col items-center justify-center gap-5">
                                    <Inbox className="text-muted-foreground size-16" />
                                    No New Notifications
                                </DropdownMenuLabel>
                            </DropdownMenuGroup>
                        )}
                        {itemsInInbox > 0 && (
                            <div className="bg-popover sticky bottom-0 flex flex-col items-center justify-center border-t-2">
                                <Button
                                    variant={'ghost'}
                                    className="text-muted-foreground w-full rounded-none"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        void feed_client.markAllAsArchived()
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
                                <DropdownMenuItem
                                    key={item.id}
                                    className="flex flex-col items-start gap-2"
                                    onClick={() => {
                                        void feed_client.markAsRead(item)
                                    }}
                                >
                                    {item.blocks.map((block) => (
                                        <div
                                            key={block.name}
                                            onClick={() => {
                                                if (item.read_at) return

                                                void feed_client.markAsRead(item)
                                            }}
                                        >
                                            {(block.type === 'markdown' ||
                                                block.type === 'text') && (
                                                <div
                                                    className={cn(
                                                        item.read_at &&
                                                            'text-muted-foreground'
                                                    )}
                                                    dangerouslySetInnerHTML={{
                                                        __html: block.rendered
                                                    }}
                                                />
                                            )}
                                            {block.type === 'button_set' && (
                                                <div>
                                                    {block.buttons.map((button) => (
                                                        <Button
                                                            key={button.name}
                                                            size={'sm'}
                                                            asChild
                                                        >
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
                        {/*Check if inbox is empty*/}
                        {itemsInArchive === 0 && (
                            <DropdownMenuGroup className="flex flex-1 flex-col items-center justify-center">
                                <DropdownMenuLabel className="flex flex-1 flex-col items-center justify-center gap-5">
                                    <Archive className="text-muted-foreground size-16" />
                                    No Archived Notifications
                                </DropdownMenuLabel>
                            </DropdownMenuGroup>
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
