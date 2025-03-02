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
import { toast } from 'sonner'

import { type Sender, type Message } from '~/lib/structures'
import { api } from '~/trpc/react'

type ChatUser = Sender & {
    profile_image: string
}

type MessagesContextType = {
    current_user_id: string | undefined
    chat_partner: ChatUser | undefined
    commission_title: string | undefined
    set_chat_partner: Dispatch<SetStateAction<ChatUser | undefined>>

    current_chat_id?: string
    set_current_chat_id: Dispatch<SetStateAction<string | undefined>>

    messages: Message[]
    set_messages: Dispatch<SetStateAction<Message[]>>

    unseen_messages: Message[]
    set_unseen_messages: Dispatch<SetStateAction<Message[]>>

    is_loading: boolean
}

const MessagesContext = createContext<MessagesContextType | null>(null)

export function MessagesProvider(props: {
    current_order_id?: string
    children: React.ReactNode
}) {
    const { user } = useUser()

    const [commissionTitle, setCommissionTitle] = useState<string | undefined>(undefined)
    const [isLoading, setIsLoading] = useState(false)
    const [currentChatId, setCurrentChatId] = useState<string | undefined>(
        props.current_order_id
    )
    const [messages, setMessages] = useState<Message[]>([])
    const [unseenMessages, setUnseenMessages] = useState<Message[]>([])
    const [chatPartner, setChatPartner] = useState<ChatUser | undefined>(undefined)

    const chatQuery = api.chat.getChat.useMutation({
        onError: (e) => {
            setIsLoading(true)
            toast.error(e.message)
        },
        onSuccess: (data) => {
            if (!user?.id) return

            setMessages(data.messages.reverse())
            setChatPartner(
                data.users.find(
                    (chat_people) => chat_people.user_id !== user?.id
                ) as ChatUser
            )
            setCommissionTitle(data.commission_title)
            setIsLoading(false)
        }
    })

    useEffect(() => {
        if (currentChatId) {
            chatQuery.mutate({ chat_id: currentChatId })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                set_chat_partner: setChatPartner,
                is_loading: isLoading,
                commission_title: commissionTitle
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
