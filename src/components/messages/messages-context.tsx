'use client'

import {
    createContext,
    Dispatch,
    SetStateAction,
    useContext,
    useEffect,
    useState
} from 'react'

import { BaseMessage, FileMessage, UserMessage } from '@sendbird/chat/message'
import { Member } from '@sendbird/chat/groupChannel'
import { SendbirdMetadata } from '~/sendbird/sendbird-structures'
import { api } from '~/trpc/react'
import { useUser } from '@clerk/nextjs'
import { InferSelectModel } from 'drizzle-orm'
import { kanbans } from '~/server/db/schema'

type MessagesContextType = {
    currentChannel?: string
    setCurrentChannel: Dispatch<SetStateAction<string | undefined>>

    session: ReturnType<typeof useUser>
    kanbanData: InferSelectModel<typeof kanbans> | undefined
    setKanbanData: Dispatch<SetStateAction<InferSelectModel<typeof kanbans> | undefined>>

    replyMode: boolean
    replyMessage?: BaseMessage | FileMessage

    start_reply: (message: UserMessage | FileMessage) => void
    cancel_reply: () => void

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
    session: ReturnType<typeof useUser>
    children: React.ReactNode
}) {
    const [currentChannel, setCurrentChannel] = useState<string | undefined>(channel_url)
    const [replyMode, setReplyMode] = useState<boolean>(false)
    const [replyMessage, setReplyMessage] = useState<
        BaseMessage | FileMessage | undefined
    >()
    const [kanbanData, setKanbanData] = useState<InferSelectModel<typeof kanbans> | undefined>(undefined)
    const [otherUser, setOtherUser] = useState<Member | undefined>(undefined)
    const [inputPlaceholder, setInputPlaceholder] = useState<string>(`Message`)
    const [metadata, setMetadata] = useState<SendbirdMetadata | undefined>(undefined)

    const kanban = api.kanban.get_kanban_messages.useMutation({
        onSuccess: (data) => {
            if (!data) return

            // setKanbanData(data)
        }
    })

    useEffect(() => {
        if (!currentChannel) return

        kanban.mutate(currentChannel)
    }, [currentChannel])

    function start_reply(message: UserMessage | FileMessage) {
        setReplyMode(true)
        setReplyMessage(message)
        setInputPlaceholder(`Replying to ${message.sender.nickname}`)
    }

    function cancel_reply() {
        setReplyMode(false)
        setReplyMessage(undefined)
        setInputPlaceholder(`Message ${otherUser?.nickname}`)
    }

    return (
        <MessagesContext.Provider
            value={{
                currentChannel,
                setCurrentChannel,
                session,
                replyMode,
                start_reply,
                cancel_reply,
                inputPlaceholder,
                setInputPlaceholder,
                replyMessage,
                otherUser,
                setOtherUser,
                metadata,
                setMetadata,
                kanbanData,
                setKanbanData
            }}
        >
            {children}
        </MessagesContext.Provider>
    )
}

export const useMessagesContext = () => useContext(MessagesContext)!
