'use client'

import { ClassNames, ConvertDateToLocaleString } from '@/core/helpers'
import { ChatMessage, ChatMessageType, ChatStatus } from '@/core/structures'
import NemuImage from '../nemu-image'
import { MouseEvent, useRef } from 'react'
import { useMessagesContext } from './messages-context'
import { useClickAway } from '@uidotdev/usehooks'
import { useGroupChannelContext } from '@sendbird/uikit-react/GroupChannel/context'
import { toast } from 'react-toastify'

export default function ChatBubble({
    message,
    current_user,
    handle_context_menu,
    chainTop,
    chainBottom,
    editing,
    hasBeenEdited
}: {
    message: ChatMessage
    handle_context_menu: (e: MouseEvent<HTMLDivElement, globalThis.MouseEvent>) => void
    current_user?: boolean
    chainTop?: boolean
    chainBottom?: boolean
    editing?: boolean
    hasBeenEdited?: boolean
}) {
    const ref = useClickAway<HTMLParagraphElement>((e) => {
        return

        if (editing) {
            setEditingId(undefined)
            editing = false
        }
    })

    const { editingId, setEditingId } = useMessagesContext()!
    const { updateUserMessage } = useGroupChannelContext()

    function GetMessageStatus(status: ChatStatus) {
        switch (status) {
            case ChatStatus.Failed:
                return 'Failed to send'
            case ChatStatus.Delivered:
                return 'Delivered'
            case ChatStatus.Read:
                return 'Read'
            case ChatStatus.Sent:
                return 'Sent'
        }
    }

    function MessageContents(message_type: ChatMessageType) {
        switch (message_type) {
            case ChatMessageType.Text:
                {
                    if (!editing) {
                        return (
                            <p>
                                {message.message} {hasBeenEdited && <span className="text-sm italic text-base-content/70">(edited)</span>}
                            </p>
                        )
                    }

                    return (
                        <div className="join rounded-xl flex items-center bg-base-100 cursor-text overflow-hidden">
                            <p ref={ref} contentEditable={editing} autoFocus={editing} className="join-item p-5 rounded-xl">
                                {message.message}
                            </p>
                            <button
                                type="button"
                                className="btn join-item"
                                onClick={() => {
                                    if (editingId && editing) {
                                        updateUserMessage(editingId, {
                                            message: ref.current.textContent!
                                        })

                                        setEditingId(undefined)
                                        editing = false
                                    }
                                }}
                            >
                                Save
                            </button>
                        </div>
                    )
                }
                break
            case ChatMessageType.Image:
                return <NemuImage src={message.signed_url!} alt="photo" width={500} height={500} className="max-w-xs rounded-xl" />
            case ChatMessageType.Admin:
                return <>Admin</>
        }
    }

    return (
        <>
            <div className={ClassNames('chat', current_user ? 'chat-end' : 'chat-start')}>
                <div className="chat-image avatar">
                    <div className="w-10 rounded-full">
                        <NemuImage src={message.profile_photo} alt="profile picture" width={200} height={200} className="avatar rounded-full" />
                    </div>
                </div>
                <div className="chat-header">
                    {message.username}
                    <time className="text-xs opacity-50 ml-2">{ConvertDateToLocaleString(message.sent_timestamp)}</time>
                </div>
                <div
                    className={ClassNames(
                        'chat-bubble',
                        current_user ? 'chat-bubble-primary text-base-content' : 'chat-bubble-accent',
                        message.message_type == ChatMessageType.Image ? 'p-0' : 'p-4'
                    )}
                    onContextMenu={handle_context_menu}
                >
                    {MessageContents(message.message_type)}
                </div>
                <div className="chat-footer opacity-50 pt-1">{GetMessageStatus(message.status)}</div>
            </div>
        </>
    )
}
