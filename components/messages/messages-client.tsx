'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'

import MessagesContent from './messages-content'
import MessageSidebar from './messages-sidebar'

import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider'
import ChannelList from '@sendbird/uikit-react/ChannelList'
import Channel from '@sendbird/uikit-react/Channel'
import ChannelSettings from '@sendbird/uikit-react/ChannelSettings'

import '@sendbird/uikit-react/dist/index.css'

export default function MessagesClient() {
    const { data: session } = useSession()

    const [channelURL, setChannelURL] = useState('')
    const [showSettings, setShowSettings] = useState(false)

    const query = useMemo(() => {
        return {
            channelListQuery: {
                includeEmpty: true
            }
        }
    }, [])

    if (!session?.user) {
        return null
    }

    return (
        <div className="flex bg-base-100 rounded-xl shadow-xl h-[60rem]">
            <div className="flex w-full h-full">
                <SendbirdProvider appId="AE781B27-397F-4722-9EC3-13E39266C944" userId={session.user.user_id!} theme="dark">
                    <ChannelList
                        onChannelSelect={(channel) => {
                            setChannelURL(channel?.url!)
                        }}
                        queries={query}
                    />
                    <Channel
                        channelUrl={channelURL}
                        onChatHeaderActionClick={() => {
                            setShowSettings(true)
                        }}
                    />
                    {showSettings && (
                        <div className='sendbird-app__settingspanel-wrap'>
                            <ChannelSettings
                                channelUrl={channelURL}
                                onCloseClick={() => {
                                    setShowSettings(false)
                                }}
                            />
                        </div>
                    )}
                </SendbirdProvider>
                {/* <div className="flex join">
                    <MessageSidebar />
                    <MessagesContent />
                </div> */}
            </div>
        </div>
    )
}
