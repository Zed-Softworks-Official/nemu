'use client'

import { Session } from 'next-auth'
import { createContext, Dispatch, SetStateAction, useContext, useState } from 'react'

import { BaseMessage, FileMessage, UserMessage } from '@sendbird/chat/message'
import { Member } from '@sendbird/chat/groupChannel'
import { SendbirdMetadata } from '~/sendbird/sendbird-structures'

type MessagesContextType = {
    currentChannel?: string
    setCurrentChannel: Dispatch<SetStateAction<string | undefined>>

    session: Session

    replyMode: boolean
    replyMessage?: BaseMessage | FileMessage
    start_reply: (message: UserMessage | FileMessage) => void

    inputPlaceholder: string
    setInputPlaceholder: Dispatch<SetStateAction<string>>

    otherUser: Member | undefined
    setOtherUser: Dispatch<SetStateAction<Member | undefined>>

    metadata: SendbirdMetadata | undefined
    setMetadata: Dispatch<SetStateAction<SendbirdMetadata | undefined>>
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
    const [otherUser, setOtherUser] = useState<Member | undefined>(undefined)
    const [inputPlaceholder, setInputPlaceholder] = useState<string>(
        `Message ${session.user.name}`
    )
    const [metadata, setMetadata] = useState<SendbirdMetadata | undefined>(undefined)

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
                replyMessage,
                otherUser,
                setOtherUser,
                metadata,
                setMetadata
            }}
        >
            {children}
        </MessagesContext.Provider>
    )
}

export const useMessagesContext = () => useContext(MessagesContext)!
