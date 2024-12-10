'use client'

import { useUser } from '@clerk/nextjs'
import {
    createContext,
    type Dispatch,
    type SetStateAction,
    useContext,
    useEffect,
    useState
} from 'react'

import { type Message } from '~/core/structures'

type MessagesContextType = {
    current_user_id: string | undefined
    chat_partner: string
    set_chat_partner: Dispatch<SetStateAction<string>>

    current_chat_id?: string
    set_current_chat_id: Dispatch<SetStateAction<string | undefined>>

    messages: Message[]
    set_messages: Dispatch<SetStateAction<Message[]>>

    unseen_messages: Message[]
    set_unseen_messages: Dispatch<SetStateAction<Message[]>>
}

const MessagesContext = createContext<MessagesContextType | null>(null)

export function MessagesProvider(props: {
    current_order_id?: string
    children: React.ReactNode
}) {
    const { user } = useUser()

    const [currentChatId, setCurrentChatId] = useState<string | undefined>(
        props.current_order_id
    )
    const [messages, setMessages] = useState<Message[]>([])
    const [unseenMessages, setUnseenMessages] = useState<Message[]>([])
    const [chatPartner, setChatPartner] = useState<string>('')

    useEffect(() => {
        if (currentChatId) {
            console.log('currentOrderId', currentChatId)
        }
    }, [currentChatId])

    return (
        <MessagesContext.Provider
            value={{
                current_user_id: user?.id,
                current_chat_id: currentChatId,
                set_current_chat_id: setCurrentChatId,
                messages: messages,
                set_messages: setMessages,
                unseen_messages: unseenMessages,
                set_unseen_messages: setUnseenMessages,
                chat_partner: chatPartner,
                set_chat_partner: setChatPartner
            }}
        >
            {props.children}
        </MessagesContext.Provider>
    )
}

export function useMessages() {
    const context = useContext(MessagesContext)

    if (!context) {
        throw new Error('useMessagesContext must be used within a MessagesProvider')
    }

    return context
}
