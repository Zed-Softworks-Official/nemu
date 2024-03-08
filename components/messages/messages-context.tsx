'use client'

import { GraphQLFetcher } from '@/core/helpers'
import { BaseMessage } from '@sendbird/chat/message'
import { EveryMessage } from '@sendbird/uikit-react'
import { Dispatch, SetStateAction, createContext, useContext, useEffect, useState } from 'react'

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

    message: EveryMessage | null
    setMessage: Dispatch<SetStateAction<EveryMessage | null>>
}

const MessagesContext = createContext<MessagesContextType | null>(null)

type FormSubmissionReponseGraphQLResponse = {
    form_submission: {
        kanban: {
            id: string
        }
        form: {
            artist: {
                userId: string
            }
        }
    }
}

export function MessagesProvider({ channel_url, children }: { channel_url: string; children: React.ReactNode }) {
    const [artistUserId, setArtistUserId] = useState('')
    const [kanbanId, setKanbanId] = useState('')

    const [editingId, setEditingId] = useState<number | undefined>(undefined)
    const [deletingMessage, setDeletingMessage] = useState<BaseMessage | undefined>(undefined)
    const [messageToAddToKanban, setMessageToAddToKanban] = useState<BaseMessage | undefined>(undefined)

    const [message, setMessage] = useState<EveryMessage | null>(null)

    useEffect(() => {
        GraphQLFetcher<FormSubmissionReponseGraphQLResponse>(
            `{
                form_submission(channel_url:"${channel_url}") {
                    kanban {
                        id
                    }
                    form {
                        artist {
                            userId
                        }
                    }
                }
            }`
        ).then((response: FormSubmissionReponseGraphQLResponse) => {
            setArtistUserId(response.form_submission.form.artist.userId)
            setKanbanId(response.form_submission.kanban.id)
        })
    }, [channel_url])

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
                message,
                setMessage
            }}
        >
            {children}
        </MessagesContext.Provider>
    )
}

export const useMessagesContext = () => useContext(MessagesContext)
