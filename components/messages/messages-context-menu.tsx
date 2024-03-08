'use client'

import { PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { useClickAway } from '@uidotdev/usehooks'
import { useSession } from 'next-auth/react'
import { BsReplyFill } from 'react-icons/bs'
import { MdPushPin } from 'react-icons/md'
import { useMessagesContext } from './messages-context'

export default function MessagesContextMenu({ x, y, close_context_menu }: { x: number; y: number; close_context_menu: () => void }) {
    const { data: session } = useSession()
    const { artistUserId, message, setEditingId, setDeletingMessage, setMessageToAddToKanban } = useMessagesContext()!

    const contextMenuRef = useClickAway<HTMLDivElement>(close_context_menu)

    return (
        <>
            <div
                ref={contextMenuRef}
                onClick={() => close_context_menu}
                onContextMenu={(e) => {
                    e.preventDefault()
                }}
                className="fixed z-30 bg-base-300 shadow-xl card"
                style={{ top: `${y}px`, left: `${x}px` }}
            >
                <ul className="menu">
                    {session?.user.user_id === artistUserId && (
                        <li>
                            <button
                                type="button"
                                onClick={() => {
                                    if (message) {
                                        setMessageToAddToKanban(message)
                                        close_context_menu()
                                    }
                                }}
                            >
                                <MdPushPin className="w-6 h-6" /> Add to Kanban
                            </button>
                        </li>
                    )}
                    <li>
                        <button type="button">
                            <BsReplyFill className="w-6 h-6" /> Reply
                        </button>
                    </li>
                    {session?.user.user_id === message?.sender.userId && (
                        <>
                            <li>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (message) {
                                            setEditingId(message.messageId)
                                            close_context_menu()
                                        }
                                    }}
                                >
                                    <PencilIcon className="w-6 h-6" /> Edit
                                </button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (message) {
                                            setDeletingMessage(message)
                                            close_context_menu()
                                        }
                                    }}
                                >
                                    <TrashIcon className="w-6 h-6" /> Delete
                                </button>
                            </li>
                        </>
                    )}
                </ul>
            </div>
        </>
    )
}
