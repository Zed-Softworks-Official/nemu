'use client'

import { GraphQLFetcher } from '@/core/helpers'
import { BaseMessage } from '@sendbird/chat/message'
import { EveryMessage } from '@sendbird/uikit-react'
import { Dispatch, SetStateAction, createContext, useContext, useEffect, useState } from 'react'
import NemuImage from '../nemu-image'

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

    message: EveryMessage | null
    setMessage: Dispatch<SetStateAction<EveryMessage | null>>

    placeholder: string
    setPlaceholder: Dispatch<SetStateAction<string>>
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
    const [replyMessage, setReplyMessage] = useState<BaseMessage | undefined>(undefined)

    const [message, setMessage] = useState<EveryMessage | null>(null)
    const [placeholder, setPlaceholder] = useState('Send Message')

    const [hasSubmissions, setHasSubmissions] = useState(true)

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
        )
            .then((response: FormSubmissionReponseGraphQLResponse) => {
                setArtistUserId(response.form_submission.form.artist.userId)
                setKanbanId(response.form_submission.kanban.id)
            })
            .catch((e) => {
                setHasSubmissions(false)
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
                replyMessage,
                setReplyMessage,
                message,
                setMessage,
                placeholder,
                setPlaceholder
            }}
        >
            {hasSubmissions ? (
                children
            ) : (
                <div className="flex flex-col w-full h-full justify-center items-center gap-5">
                    <NemuImage src={'/nemu/sad.png'} alt="Sad Nemu" width={200} height={200} />
                    <h2 className="card-title">You have no messages</h2>
                </div>
            )}
        </MessagesContext.Provider>
    )
}

export const useMessagesContext = () => useContext(MessagesContext)
