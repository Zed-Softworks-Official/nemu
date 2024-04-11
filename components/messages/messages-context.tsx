'use client'

import { BaseMessage } from '@sendbird/chat/message'
import {
    Dispatch,
    SetStateAction,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState
} from 'react'
import NemuImage from '../nemu-image'
import Loading from '../loading'
import { api } from '@/core/trpc/react'

type MessagesContextType = {
    artistUserId: string
    setArtistUserId: Dispatch<SetStateAction<string>>

    kanbanId: string
    setKanbanId: Dispatch<SetStateAction<string>>

    messageToAddToKanban?: BaseMessage
    setMessageToAddToKanban: Dispatch<SetStateAction<BaseMessage | undefined>>

    editingId?: number
    setEditingId: Dispatch<SetStateAction<number | undefined>>

    deletingMessage?: BaseMessage
    setDeletingMessage: Dispatch<SetStateAction<BaseMessage | undefined>>

    replyMessage?: BaseMessage
    setReplyMessage: Dispatch<SetStateAction<BaseMessage | undefined>>

    message: BaseMessage | null
    setMessage: Dispatch<SetStateAction<BaseMessage | null>>

    placeholder: string
    setPlaceholder: Dispatch<SetStateAction<string>>
}

const MessagesContext = createContext<MessagesContextType | null>(null)

export function MessagesProvider({
    channel_url,
    children
}: {
    channel_url: string
    children: React.ReactNode
}) {
    const [artistUserId, setArtistUserId] = useState('')
    const [kanbanId, setKanbanId] = useState('')

    const [editingId, setEditingId] = useState<number | undefined>(undefined)
    const [deletingMessage, setDeletingMessage] = useState<BaseMessage | undefined>(
        undefined
    )
    const [messageToAddToKanban, setMessageToAddToKanban] = useState<
        BaseMessage | undefined
    >(undefined)
    const [replyMessage, setReplyMessage] = useState<BaseMessage | undefined>(undefined)

    const [message, setMessage] = useState<BaseMessage | null>(null)
    const [placeholder, setPlaceholder] = useState('Send Message')

    const [hasSubmissions, setHasSubmissions] = useState(true)

    const { data: request, isLoading } = api.form.get_request.useQuery({ channel_url })

    useCallback(() => {
        if (request?.data) {
            setArtistUserId(request.data.commission.artist.userId)
            setKanbanId(request.kanban?.id!)
        } else {
            setHasSubmissions(false)
        }
    }, [channel_url])

    if (isLoading) {
        return <Loading />
    }

    return (
        <MessagesContext.Provider
            value={{
                artistUserId,
                setArtistUserId,
                kanbanId,
                setKanbanId,
                editingId,
                setEditingId,
                deletingMessage,
                setDeletingMessage,
                messageToAddToKanban,
                setMessageToAddToKanban,
                replyMessage,
                setReplyMessage,
                message,
                setMessage,
                placeholder,
                setPlaceholder
            }}
        >
            {children}
            {/* {hasSubmissions ? (
                children
            ) : (
                <div className="flex flex-col w-full h-full justify-center items-center gap-5">
                    <NemuImage
                        src={'/nemu/sad.png'}
                        alt="Sad Nemu"
                        width={200}
                        height={200}
                    />
                    <h2 className="card-title">You have no messages</h2>
                </div>
            )} */}
        </MessagesContext.Provider>
    )
}

export const useMessagesContext = () => useContext(MessagesContext)
