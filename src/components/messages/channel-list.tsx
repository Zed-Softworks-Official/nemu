'use client'

import { redirect } from 'next/navigation'
import {
    type Dispatch,
    type SetStateAction,
    useMemo,
    type MouseEventHandler
} from 'react'

import {
    useGroupChannelListContext,
    GroupChannelListProvider
} from '@sendbird/uikit-react/GroupChannelList/context'
import type { GroupChannel } from '@sendbird/chat/groupChannel'

import { useUser } from '@clerk/nextjs'

import { Separator } from '~/components/ui/separator'
import { cn } from '~/lib/utils'
import Loading from '~/components/ui/loading'

export function ChannelList(props: {
    hide?: boolean
    setCurrentChannel: Dispatch<SetStateAction<string | undefined>>
}) {
    const query = useMemo(() => {
        return {
            includeEmpty: true
        }
    }, [])

    if (props.hide) {
        return null
    }

    return (
        <GroupChannelListProvider
            onChannelSelect={(channel) => props.setCurrentChannel(channel?.url)}
            onChannelCreated={() => null}
            channelListQueryParams={query}
        >
            <CustomChannelList />
        </GroupChannelListProvider>
    )
}

function CustomChannelList() {
    const groupChannelContext = useGroupChannelListContext()
    const clerk = useUser()

    if (!clerk.isLoaded) {
        return <Loading />
    }

    if (!clerk.user) {
        return redirect('/u/login')
    }

    return (
        <div className="border-base-content/[0.1] border-r-base-content/[0.1] flex h-full w-full min-w-72 flex-col gap-5 border-r p-5">
            <div className="flex w-full flex-col gap-3">
                <h1 className="text-xl font-bold">Channels</h1>
                <Separator />
            </div>
            {groupChannelContext.groupChannels.map((channel) => (
                <CustomChannelPreview
                    key={channel.url}
                    currentUserId={clerk.user.id}
                    onClick={() => {
                        groupChannelContext.onChannelSelect(channel)
                    }}
                    channel={channel}
                    active={channel.url === groupChannelContext.selectedChannelUrl}
                />
            ))}
        </div>
    )
}

function CustomChannelPreview(props: {
    active?: boolean
    channel: GroupChannel
    currentUserId: string
    onClick: MouseEventHandler<HTMLDivElement> | undefined
}) {
    const otherUser = props.channel.members.find(
        (member) => member.userId !== props.currentUserId
    )

    if (!otherUser) {
        return null
    }

    return (
        <div
            className={cn(
                'h-fit w-full cursor-pointer rounded-xl p-10 transition-all duration-300 ease-in-out hover:bg-primary',
                props.active ? 'bg-primary' : 'bg-base-200'
            )}
            onClick={props.onClick}
        >
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-bold">{otherUser.nickname}</h2>
                <p className="text-base-content/60 text-sm">
                    {props.channel.lastMessage?.message ?? 'No messages'}
                </p>
            </div>
        </div>
    )
}
