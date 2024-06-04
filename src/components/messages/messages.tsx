'use client'

import { useUser } from '@clerk/nextjs'
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider'

import Channel from '~/components/messages/channel'
import ChannelList from '~/components/messages/channel-list'

import { MessagesProvider } from '~/components/messages/messages-context'
import Loading from '~/components/ui/loading'

export default function MessagesClient(props: {
    hide_channel_list?: boolean
    channel_url?: string
}) {
    const session = useUser()

    if (!session.isLoaded || !session.user) {
        return <Loading />
    }

    return (
        <div className="flex h-full max-h-[40rem] w-full flex-row overflow-hidden rounded-xl bg-base-300 shadow-xl">
            <SendbirdProvider
                appId="AE781B27-397F-4722-9EC3-13E39266C944"
                userId={session.user.id}
                theme="dark"
                uikitOptions={{
                    groupChannel: {
                        enableVoiceMessage: false
                    }
                }}
            >
                <MessagesProvider channel_url={props.channel_url} session={session}>
                    <ChannelList hide_channel_list={props.hide_channel_list} />
                    <Channel />
                </MessagesProvider>
            </SendbirdProvider>
        </div>
    )
}
