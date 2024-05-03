'use client'

import Channel from '~/components/messages/channel'
import ChannelList from '~/components/messages/channel-list'

import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider'

import { MessagesProvider } from '~/components/messages/messages-context'
import { useUser } from '@clerk/nextjs'

export default function MessagesClient(props: {
    hide_channel_list?: boolean
    channel_url?: string
}) {
    const session = useUser()

    if (!session.isLoaded || !session.user) {
        return null
    }

    return (
        <div className="flex h-full max-h-[40rem] w-full max-w-[90%] flex-row overflow-hidden rounded-xl bg-base-300 shadow-xl">
            <SendbirdProvider
                appId="AE781B27-397F-4722-9EC3-13E39266C944"
                userId={session.user.id}
                theme="dark"
                isVoiceMessageEnabled={false}
            >
                <MessagesProvider channel_url={props.channel_url} session={session}>
                    <ChannelList hide_channel_list={props.hide_channel_list} />
                    <Channel />
                </MessagesProvider>
            </SendbirdProvider>
        </div>
    )
}
