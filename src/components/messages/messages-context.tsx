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

import { type Sender, type Message } from '~/lib/types'
import { api } from '~/trpc/react'

type ChatUser = Sender & {
    profileImage: string
}

type MessagesContextType = {
    currentUserId: string | undefined
    chatPartner: ChatUser | undefined
    commissionTitle: string | undefined
    setChatPartner: Dispatch<SetStateAction<ChatUser | undefined>>

    currentChatId?: string
    setCurrentChatId: Dispatch<SetStateAction<string | undefined>>

    messages: Message[]
    setMessages: Dispatch<SetStateAction<Message[]>>

    unseenMessages: Message[]
    setUnseenMessages: Dispatch<SetStateAction<Message[]>>

    isLoading: boolean
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
                    (chat_people) => chat_people.userId !== user?.id
                ) as ChatUser
            )
            setCommissionTitle(data.commissionTitle)
            setIsLoading(false)
        }
    })

    useEffect(() => {
        if (currentChatId) {
            chatQuery.mutate({ chatId: currentChatId })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentChatId])

    return (
        <MessagesContext.Provider
            value={{
                currentUserId: user?.id,
                currentChatId,
                setCurrentChatId,
                messages,
                setMessages,
                unseenMessages,
                setUnseenMessages,
                chatPartner,
                setChatPartner,
                isLoading,
                commissionTitle
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
