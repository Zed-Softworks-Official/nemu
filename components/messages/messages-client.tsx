'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'

import MessagesContent from './channel'
import ChannelList from './channel-list'

import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider'
import Channel from '@sendbird/uikit-react/Channel'
import ChannelSettings from '@sendbird/uikit-react/ChannelSettings'

import '@sendbird/uikit-react/dist/index.css'

export default function MessagesClient() {
    const { data: session } = useSession()

    const [channelURL, setChannelURL] = useState('')

    if (!session?.user) {
        return null
    }

    return (
        <div className="flex bg-base-100 rounded-xl shadow-xl h-[60rem] overflow-hidden">
            <div className="flex join w-full h-full">
                <SendbirdProvider appId="AE781B27-397F-4722-9EC3-13E39266C944" userId={session.user.user_id!} theme="dark">
                    <ChannelList selected_channel={channelURL} set_channel_url={setChannelURL} />
                    {false ? <Channel channelUrl={channelURL} /> : <MessagesContent channel_url={channelURL} />}
                </SendbirdProvider>
            </div>
        </div>
    )
}
