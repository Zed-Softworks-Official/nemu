'use client'

import {
    createContext,
    type Dispatch,
    type SetStateAction,
    useContext,
    useState
} from 'react'

import { type Message } from '~/core/structures'

type MessagesContextType = {
    current_order_id?: string
    set_current_order_id: Dispatch<SetStateAction<string | undefined>>

    messages: Message[]
    set_messages: Dispatch<SetStateAction<Message[]>>
}

const MessagesContext = createContext<MessagesContextType | null>(null)

export function MessagesProvider(props: {
    current_order_id?: string
    children: React.ReactNode
}) {
    const [currentOrderId, setCurrentOrderId] = useState<string | undefined>(
        props.current_order_id
    )
    const [messages, setMessages] = useState<Message[]>([])

    return (
        <MessagesContext.Provider
            value={{
                current_order_id: currentOrderId,
                set_current_order_id: setCurrentOrderId,
                messages: messages,
                set_messages: setMessages
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
