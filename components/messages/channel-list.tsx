'use client'

import { useChannelListContext, ChannelListProvider } from '@sendbird/uikit-react/ChannelList/context'
import { UserMessage, BaseMessage } from '@sendbird/chat/message'

import MessagesCard from './messages-card'
import Loading from '../loading'
import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { GroupChannel } from '@sendbird/chat/groupChannel'
import ChannelListUI from '@sendbird/uikit-react/ChannelList/components/ChannelListUI'
import { TriangleAlertIcon } from 'lucide-react'

interface ChannelListProps {
    selected_channel: string
    set_channel_url: (value: string) => void
}

function CustomChannelList({ selected_channel, set_channel_url }: ChannelListProps) {
    const { loading, initialized } = useChannelListContext()
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

    function UnreadBadge(channel: GroupChannel) {
        return false

        // if (!channel.lastMessage) {
        //     return false
        // }

        // const member = channel.isReadMessage(channel.lastMessage)
        // return member
    }

    if (!initialized) {
        return (
            <div className="bg-base-200 join-item p-5 flex flex-col gap-5 h-full justify-center items-center w-96">
                <TriangleAlertIcon className="w-10 h-10" />
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
        <ChannelListUI
            renderHeader={() => (
                <div className="flex flex-col">
                    <h2 className="card-title">Messages</h2>
                    <div className="divider"></div>
                </div>
            )}
            renderChannelPreview={({ channel, isSelected }) => (
                <MessagesCard
                    message_preview={{
                        channel_name: channel.members.find((member) => member.userId != session?.user.user_id)?.nickname || 'Unkown',
                        other_username: channel.lastMessage ? channel.lastMessage.sender.nickname : 'unknown',
                        channel_url: channel.url,
                        unread_messages: UnreadBadge(channel),
                        last_message: channel.lastMessage ? GetLastMessage(channel.lastMessage) : undefined,
                        late_message_timestamp: channel.lastMessage ? new Date(channel.lastMessage.createdAt) : undefined,
                        last_message_current_user: channel.lastMessage ? channel.lastMessage.sender.userId == session?.user.user_id : false
                    }}
                    onClick={() => {
                        set_channel_url(channel.url)
                    }}
                    selected={channel.url == selected_channel}
                />
            )}
        />
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
