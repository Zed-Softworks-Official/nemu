'use client'

import { ClassNames, ConvertDateToLocaleString } from '@/core/helpers'
import { ChatMessage, ChatMessageType, ChatStatus } from '@/core/structures'
import NemuImage from '../nemu-image'
import { MouseEvent, useRef } from 'react'
import { useMessagesContext } from './messages-context'
import { useClickAway } from '@uidotdev/usehooks'
import { useGroupChannelContext } from '@sendbird/uikit-react/GroupChannel/context'
import { toast } from 'react-toastify'
import { BaseMessage, FileMessage, UserMessage } from '@sendbird/chat/message'
import { BsReplyFill } from 'react-icons/bs'

export default function ChatBubble({
    message,
    current_user,
    handle_context_menu,
    chain_top,
    chain_bottom,
    has_separator,
    editing,
    has_been_edited,
    parent_message,
    parent_type
}: {
    message: ChatMessage
    handle_context_menu: (e: MouseEvent<HTMLDivElement, globalThis.MouseEvent>) => void
    current_user?: boolean
    chain_top?: boolean
    chain_bottom?: boolean
    has_separator?: boolean
    editing?: boolean
    has_been_edited?: boolean
    parent_message?: BaseMessage
    parent_type?: ChatMessageType
}) {
    const ref = useClickAway<HTMLParagraphElement>((e) => {
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

    function MessageContents(message_type: ChatMessageType | undefined) {
        if (message_type == undefined) {
            return undefined
        }

        switch (message_type) {
            case ChatMessageType.Text:
                {
                    if (!editing) {
                        return (
                            <p>
                                {message.message} {has_been_edited && <span className="text-sm italic text-base-content/70">(edited)</span>}
                            </p>
                        )
                    }

                    return (
                        <div className="rounded-xl flex items-center bg-base-100 cursor-text overflow-hidden">
                            <p
                                ref={ref}
                                contentEditable={editing}
                                autoFocus={editing}
                                className="p-5 rounded-xl"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (editingId && editing) {
                                            updateUserMessage(editingId, {
                                                message: ref.current.textContent!
                                            })

                                            setEditingId(undefined)
                                            editing = false
                                        }
                                    }
                                }}
                            >
                                {message.message}
                            </p>
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

    function ParentContents(message_type: ChatMessageType | undefined) {
        if (message_type == undefined) {
            return undefined
        }

        switch (message_type) {
            case ChatMessageType.Text:
                return <p>{(parent_message as UserMessage).message}</p>

            case ChatMessageType.Image:
                return <NemuImage src={(parent_message as FileMessage).url} alt="photo" width={500} height={500} className="max-w-xs rounded-xl" />
            case ChatMessageType.Admin:
                return <>Admin</>
        }
    }

    return (
        <>
            {has_separator && (
                <div className="divider font-bold">
                    {message.sent_timestamp.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })}
                </div>
            )}
            {parent_message && (
                <div className={ClassNames('chat opacity-60', current_user ? 'chat-end' : 'chat-start')}>
                    <div className="chat-header">
                        <BsReplyFill className='w-4 h-4' /> Reply to
                    </div>
                    <div
                        className={ClassNames(
                            'chat-bubble',
                            current_user ? 'chat-bubble-primary text-base-content' : 'chat-bubble-accent',
                            parent_type == ChatMessageType.Image ? 'p-0' : 'p-4'
                        )}
                        onContextMenu={handle_context_menu}
                    >
                        {ParentContents(parent_type)}
                    </div>
                </div>
            )}
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
