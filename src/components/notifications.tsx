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
import { AlignCenter, Archive, BellIcon, Inbox } from 'lucide-react'
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
import { TabsTrigger } from '@radix-ui/react-tabs'
import { Tabs, TabsContent, TabsList } from './ui/tabs'
import { Separator } from './ui/separator'
import { useState } from 'react'
import { Knock } from '@knocklabs/node'
import { knock } from '~/server/knock'

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
    const [selectedTab, setSelectedTab] = useState('inbox')

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
                        <div className="absolute right-0 top-0 size-2 rounded-full bg-primary"></div>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="flex max-h-[500px] max-w-[300px] min-h-[500px] min-w-[300px] flex-col gap-2 overflow-y-auto"
            >
                <Tabs defaultValue="inbox" className="flex flex-col flex-grow" onValueChange={setSelectedTab}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="inbox" className={selectedTab === 'inbox' ? 'text-primary' : 'text-muted-foreground'}>Inbox</TabsTrigger>
                        <TabsTrigger value="archive" className={selectedTab === 'archive' ? 'text-primary' : 'text-muted-foreground'}>Archive</TabsTrigger>
                    </TabsList>
                    <TabsContent value="inbox" className="flex flex-col flex-grow">
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
                            <Button
                                    variant={'ghost'}
                                    size={'sm'}
                                    className="text-muted-foreground"
                                    onClick={() => feed_client.markAsArchived(item)}
                                >
                                    Archive
                            </Button>
                        </DropdownMenuItem>
                    ))}
                    {/*Check if inbox is empty*/}
                    {metadata?.total_count == 0 && (
                        <DropdownMenuGroup className="flex flex-col items-center justify-center">
                            <DropdownMenuLabel className="flex flex-col items-center justify-center">
                                <Inbox size={'80'} className="text-muted-foreground" />
                                No New Notifications
                            </DropdownMenuLabel>
                        </DropdownMenuGroup>
                    )}
                    <div className="mt-auto flex flex-col items-center justify-center gap-2">
                        <Separator className="w-full" />
                        <Button
                            variant={'ghost'}
                            className="flex items-center text-muted-foreground align-bottom"
                            onClick={() => {
                                void feed_client.markAllAsArchived()
                            }}
                        >
                            Archive All
                        </Button>
                    </div>
                    </TabsContent>
                    <TabsContent value="archive" className="flex flex-col flex-grow">
                        {items.filter(item => item.archived_at).map((item) => (
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
                        {/*Check if inbox is empty*/}
                        {items.filter(item => item.archived_at).length === 0 && (
                        <DropdownMenuGroup className="flex flex-col items-center justify-center">
                            <DropdownMenuLabel className="flex flex-col items-center justify-center">
                                <Inbox  size={'80'} className="text-muted-foreground"></Inbox>
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
