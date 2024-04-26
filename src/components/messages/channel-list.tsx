'use client'

import {
    useChannelListContext,
    ChannelListProvider
} from '@sendbird/uikit-react/ChannelList/context'
import { UserMessage, BaseMessage } from '@sendbird/chat/message'

import Loading from '~/components/ui/loading'
import { useMemo } from 'react'
import { TriangleAlertIcon } from 'lucide-react'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { cn } from '~/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { useMessagesContext } from '~/components/messages/messages-context'

function CustomChannelList() {
    const { allChannels, loading, initialized } = useChannelListContext()
    const { currentChannel, setCurrentChannel } = useMessagesContext()

    if (!initialized) {
        return (
            <div className="bg-base-200 p-5 flex flex-col gap-5 h-full justify-center items-center w-full max-w-96">
                <TriangleAlertIcon className="w-10 h-10" />
                <h2 className="card-title">Something went wrong!</h2>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="bg-base-200 p-5 flex flex-col gap-5 h-full justify-center items-center w-full max-w-96">
                <Loading />
            </div>
        )
    }

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
        <div className="flex flex-col gap-5 p-5 join-item bg-base-300 h-full w-full">
            <div className="flex flex-col">
                <h2 className="card-title">Channels</h2>
                <div className="divider"></div>
            </div>
            {allChannels.map((channel) => (
                <Card
                    className={cn(
                        'bg-base-200 transition-all duration-200 ease-in-out cursor-pointer w-full hover:bg-primary active:scale-95',
                        currentChannel === channel.url && 'bg-primary'
                    )}
                    onClick={() => setCurrentChannel(channel.url)}
                >
                    <CardHeader>
                        <div className="flex flex-row gap-5 items-center">
                            <Avatar>
                                <AvatarImage src={channel.coverUrl} alt="Channel Image" />
                                <AvatarFallback></AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col gap-3">
                                <CardTitle>{channel.name}</CardTitle>
                                <CardDescription>
                                    <Badge className='badge-sm'>Test Commission</Badge>
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {channel.lastMessage
                            ? GetLastMessage(channel.lastMessage)
                            : 'No messages'}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export default function ChannelList({
    hide_channel_list
}: {
    hide_channel_list?: boolean
}) {
    if (hide_channel_list) {
        return null
    }

    const query = useMemo(() => {
        return {
            channelListQuery: {
                includeEmpty: true
            }
        }
    }, [])

    return (
        <ChannelListProvider queries={query} isTypingIndicatorEnabled={true}>
            <CustomChannelList />
        </ChannelListProvider>
    )
}
