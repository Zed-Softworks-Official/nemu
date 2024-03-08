'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'

import Channel from './channel'
import ChannelList from './channel-list'

import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider'

import '@sendbird/uikit-react/dist/index.css'
import { MessagesProvider } from './messages-context'

export default function MessagesClient({ hide_channel_list, channel_url }: { hide_channel_list?: boolean, channel_url?: string }) {
    const { data: session } = useSession()

    const [channelURL, setChannelURL] = useState(channel_url || '')

    if (!session?.user) {
        return null
    }

    return (
        <div className="flex bg-base-100 rounded-xl shadow-xl h-[60rem] overflow-hidden">
            <div className="flex join w-full h-full">
                <SendbirdProvider
                    appId="AE781B27-397F-4722-9EC3-13E39266C944"
                    userId={session.user.user_id!}
                    theme="dark"
                    uikitOptions={{
                        groupChannel: {
                            enableTypingIndicator: true
                        }
                    }}
                >
                    <MessagesProvider channel_url={channelURL}>
                        {!hide_channel_list && <ChannelList selected_channel={channelURL} set_channel_url={setChannelURL} />}
                        <Channel channel_url={channelURL} />
                    </MessagesProvider>
                </SendbirdProvider>
            </div>
        </div>
    )
}
