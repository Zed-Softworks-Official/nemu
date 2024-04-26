'use client'

import Channel from '~/components/messages/channel'
import ChannelList from '~/components/messages/channel-list'

import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider'

import { MessagesProvider } from '~/components/messages/messages-context'
import { Session } from 'next-auth'

import '@sendbird/uikit-react/dist/index.css'

export default function MessagesClient({
    hide_channel_list,
    channel_url,
    session
}: {
    session: Session
    hide_channel_list?: boolean
    channel_url?: string
}) {
    return (
        <div className="flex bg-base-300 rounded-xl shadow-xl overflow-hidden min-w-xl min-h-[70%] w-full max-w-6xl">
            <div className="flex join w-full h-full">
                <SendbirdProvider
                    appId="AE781B27-397F-4722-9EC3-13E39266C944"
                    userId={session.user.id}
                    theme="dark"
                    uikitOptions={{
                        groupChannel: {
                            enableTypingIndicator: true
                        }
                    }}
                >
                    <MessagesProvider channel_url={channel_url} session={session}>
                        <ChannelList hide_channel_list={hide_channel_list} />
                        <Channel />
                    </MessagesProvider>
                </SendbirdProvider>
            </div>
        </div>
    )
}
