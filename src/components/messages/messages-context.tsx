'use client'

import {
    createContext,
    type Dispatch,
    type SetStateAction,
    useContext,
    useEffect,
    useState
} from 'react'

import type { BaseMessage, FileMessage, UserMessage } from '@sendbird/chat/message'
import type { Member } from '@sendbird/chat/groupChannel'
import type { SendbirdMetadata } from '~/server/sendbird'
import { api } from '~/trpc/react'
import type { useUser } from '@clerk/nextjs'
import type { RouterOutput } from '~/core/structures'

type MessagesContextType = {
    currentChannel?: string
    setCurrentChannel: Dispatch<SetStateAction<string | undefined>>

    session: ReturnType<typeof useUser>
    kanbanData: RouterOutput['kanban']['get_kanban_messages'] | undefined
    setKanbanData: Dispatch<
        SetStateAction<RouterOutput['kanban']['get_kanban_messages'] | undefined>
    >

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
    const [kanbanData, setKanbanData] = useState<
        RouterOutput['kanban']['get_kanban_messages'] | undefined
    >(undefined)
    const [otherUser, setOtherUser] = useState<Member | undefined>(undefined)
    const [inputPlaceholder, setInputPlaceholder] = useState<string>(`Message`)
    const [metadata, setMetadata] = useState<SendbirdMetadata | undefined>(undefined)

    const kanban = api.kanban.get_kanban_messages.useMutation({
        onSuccess: (data) => {
            if (!data) return

            setKanbanData(data)
        }
    })

    useEffect(() => {
        if (!currentChannel) return

        kanban.mutate(currentChannel)
    }, [currentChannel, kanban])

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
