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
import { SendbirdMetadata } from '~/sendbird/sendbird-structures'

function CustomChannelList() {
    const { allChannels, loading, initialized } = useChannelListContext()
    const { currentChannel, setCurrentChannel, session, setOtherUser, setMetadata } =
        useMessagesContext()

    if (!initialized) {
        return (
            <div className="flex h-full w-full max-w-96 flex-col items-center justify-center gap-5 bg-base-200 p-5">
                <TriangleAlertIcon className="h-10 w-10" />
                <h2 className="card-title">Something went wrong!</h2>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex h-full w-full max-w-96 flex-col items-center justify-center gap-5 bg-base-200 p-5">
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
        <div className="join-item flex h-full w-14 md:w-60 xl:w-96 flex-col gap-5 bg-base-300 p-5">
            <div className="flex flex-col">
                <h2 className="card-title">Channels</h2>
                <div className="divider"></div>
            </div>
            {allChannels.map((channel) => {
                const metadata = JSON.parse(
                    channel.data.replace(/'/g, '"')
                ) as SendbirdMetadata

                const other_user = channel.members.filter(
                    (member) => member.userId !== session?.user?.id
                )[0]

                return (
                    <Card
                        key={channel.url}
                        className={cn(
                            'w-full cursor-pointer bg-base-200 transition-all duration-200 ease-in-out hover:bg-primary active:scale-95',
                            currentChannel === channel.url && 'bg-primary'
                        )}
                        onMouseDown={() => {
                            setCurrentChannel(channel.url)
                            setOtherUser(other_user)
                            setMetadata(metadata)
                        }}
                    >
                        <CardHeader>
                            <div className="flex flex-row items-center gap-5">
                                <Avatar>
                                    <AvatarImage
                                        src={other_user?.profileUrl}
                                        alt="Channel Image"
                                    />
                                    <AvatarFallback></AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col gap-3">
                                    <CardTitle>{other_user?.nickname}</CardTitle>
                                    <Badge className="badge-sm">
                                        {metadata.commission_title}
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {channel.lastMessage
                                ? GetLastMessage(channel.lastMessage)
                                : 'No messages'}
                        </CardContent>
                    </Card>
                )
            })}
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
