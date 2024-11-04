'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import { env } from '~/env'

import { ChannelList } from '~/components/messages/channel-list'
import { Channel } from '~/components/messages/channel'

const SendbirdProvider = dynamic(() => import('@sendbird/uikit-react/SendbirdProvider'), {
    ssr: false
})

export default function MessagesClient(props: {
    user_id: string
    hide?: boolean
    channel_url?: string
}) {
    const [currentChannelUrl, setCurrentChannelUrl] = useState<string | undefined>(
        props.channel_url ?? undefined
    )

    return (
        <div className="flex h-full w-full flex-row overflow-hidden">
            <SendbirdProvider
                appId={env.NEXT_PUBLIC_SENDBIRD_APP_ID}
                userId={props.user_id}
                uikitOptions={{ groupChannel: { enableVoiceMessage: false } }}
            >
                <ChannelList hide={props.hide} setCurrentChannel={setCurrentChannelUrl} />
                <Channel channel_url={currentChannelUrl} />
            </SendbirdProvider>
        </div>
    )
}
