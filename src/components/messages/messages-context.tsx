'use client'

import { Session } from 'next-auth'
import { createContext, Dispatch, SetStateAction, useContext, useState } from 'react'

import { BaseMessage, FileMessage, UserMessage } from '@sendbird/chat/message'

type MessagesContextType = {
    currentChannel?: string
    setCurrentChannel: Dispatch<SetStateAction<string | undefined>>

    session: Session

    replyMode: boolean
    replyMessage?: BaseMessage | FileMessage
    start_reply: (message: UserMessage | FileMessage) => void

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
    const [replyMessage, setReplyMessage] = useState<
        BaseMessage | FileMessage | undefined
    >()
    const [inputPlaceholder, setInputPlaceholder] = useState<string>(
        `Message ${session.user.name}`
    )

    function start_reply(message: UserMessage | FileMessage) {
        setReplyMode(true)
        setReplyMessage(message)
        setInputPlaceholder(`Replying to ${message.sender.nickname}`)
    }

    return (
        <MessagesContext.Provider
            value={{
                currentChannel,
                setCurrentChannel,
                session,
                replyMode,
                start_reply,
                inputPlaceholder,
                setInputPlaceholder,
                replyMessage
            }}
        >
            {children}
        </MessagesContext.Provider>
    )
}

export const useMessagesContext = () => useContext(MessagesContext)!
