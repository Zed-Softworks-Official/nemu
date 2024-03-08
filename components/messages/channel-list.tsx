'use client'

import { useChannelListContext, ChannelListProvider } from '@sendbird/uikit-react/ChannelList/context'
import { UserMessage, BaseMessage } from '@sendbird/chat/message'

import MessagesCard from './messages-card'
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import Loading from '../loading'
import { useMemo } from 'react'
import { useSession } from 'next-auth/react'

interface ChannelListProps {
    selected_channel: string
    set_channel_url: (value: string) => void
}

function CustomChannelList({ selected_channel, set_channel_url }: ChannelListProps) {
    const { allChannels, loading, initialized } = useChannelListContext()
    const { data: session } = useSession()

    function GetLastMessage(last_message: BaseMessage) {
        if (last_message.isUserMessage()) {
            return (last_message as UserMessage).message
        }

        if (last_message.isFileMessage()) {
            return 'Sent a file'
        }

        return 'Error Parsing Message'
    }

    if (!initialized) {
        return (
            <div className="bg-base-200 join-item p-5 flex flex-col gap-5 h-full justify-center items-center w-96">
                <ExclamationTriangleIcon className="w-10 h-10" />
                <h2 className="card-title">Something went wrong!</h2>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="bg-base-200 join-item p-5 flex flex-col gap-5 h-full justify-center items-center w-96">
                <Loading />
            </div>
        )
    }

    return (
        <div className="bg-base-200 join-item p-5 flex flex-col gap-5 h-full w-96">
            <div className="pt-5">
                <h2 className="card-title">Messages</h2>
                <div className="divider"></div>
            </div>
            {allChannels.map((channel) => (
                <MessagesCard
                    message_preview={{
                        other_username: channel.name,
                        channel_url: channel.url,
                        last_message: channel.lastMessage ? GetLastMessage(channel.lastMessage) : undefined,
                        late_message_timestamp: channel.lastMessage ? new Date(channel.lastMessage.createdAt) : undefined,
                        last_message_current_user: channel.lastMessage ? channel.lastMessage.sender.userId == session?.user.user_id : false
                    }}
                    onClick={() => {
                        set_channel_url(channel.url)
                    }}
                    selected={channel.url == selected_channel}
                />
            ))}
        </div>
    )
}

export default function ChannelList({ selected_channel, set_channel_url }: ChannelListProps) {
    const query = useMemo(() => {
        return {
            channelListQuery: {
                includeEmpty: true
            }
        }
    }, [])

    return (
        <ChannelListProvider queries={query} isTypingIndicatorEnabled={true}>
            <CustomChannelList selected_channel={selected_channel} set_channel_url={set_channel_url} />
        </ChannelListProvider>
    )
}
