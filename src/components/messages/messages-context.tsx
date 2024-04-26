'use client'

import { Session } from 'next-auth'
import { createContext, Dispatch, SetStateAction, useContext, useState } from 'react'

import { BaseMessage } from '@sendbird/chat/message'

type MessagesContextType = {
    currentChannel?: string
    setCurrentChannel: Dispatch<SetStateAction<string | undefined>>

    session: Session

    replyMode: boolean
    setReplyMode: Dispatch<SetStateAction<boolean>>

    inputPlaceholder: string
    setInputPlaceholder: Dispatch<SetStateAction<string>>
}

const MessagesContext = createContext<MessagesContextType | null>(null)

export function MessagesProvider({
    channel_url,
    session,
    children
}: {
    channel_url?: string
    session: Session
    children: React.ReactNode
}) {
    const [currentChannel, setCurrentChannel] = useState<string | undefined>(channel_url)
    const [replyMode, setReplyMode] = useState<boolean>(false)
    const [inputPlaceholder, setInputPlaceholder] = useState<string>(
        `Message ${session.user.name}`
    )

    return (
        <MessagesContext.Provider
            value={{
                currentChannel,
                setCurrentChannel,
                session,
                replyMode,
                setReplyMode,
                inputPlaceholder,
                setInputPlaceholder
            }}
        >
            {children}
        </MessagesContext.Provider>
    )
}

export const useMessagesContext = () => useContext(MessagesContext)!
