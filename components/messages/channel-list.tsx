'use client'

import { useChannelListContext, ChannelListProvider } from '@sendbird/uikit-react/ChannelList/context'
import { UserMessage, BaseMessage } from '@sendbird/chat/message'

import MessagesCard from './messages-card'
import PlaceHolder, { PlaceHolderTypes } from '@sendbird/uikit-react/ui/PlaceHolder'

interface ChannelListProps {
    selected_channel: string
    set_channel_url: (value: string) => void
}

function CustomChannelList({ selected_channel, set_channel_url }: ChannelListProps) {
    const { allChannels, loading, initialized } = useChannelListContext()
    if (!initialized) return <PlaceHolder type={PlaceHolderTypes.WRONG} />
    if (loading) return <PlaceHolder type={PlaceHolderTypes.LOADING} />

    function GetLastMessage(last_message: BaseMessage) {
        if (last_message.isUserMessage()) {
            return (last_message as UserMessage).message
        }

        if (last_message.isFileMessage()) {
            return 'Sent a file'
        }

        return 'Error Parsing Message'
    }

    return (
        <div className="bg-base-200 join-item p-5 flex flex-col gap-5 h-full">
            <div className="pt-5">
                <h2 className="card-title">Channels</h2>
                <div className="divider"></div>
            </div>
            {allChannels.map((channel) => (
                <MessagesCard
                    message_preview={{
                        other_username: channel.name,
                        last_message: GetLastMessage(channel.lastMessage!),
                        late_message_timestamp: new Date(channel.lastMessage?.createdAt!),
                        last_message_current_user: true
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
    return (
        <ChannelListProvider>
            <CustomChannelList selected_channel={selected_channel} set_channel_url={set_channel_url} />
        </ChannelListProvider>
    )
}
