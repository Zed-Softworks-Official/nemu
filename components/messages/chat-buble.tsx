'use client'

import { ClassNames, ConvertDateToLocaleString } from '@/core/helpers'
import { ChatMessage, ChatMessageType, ChatStatus } from '@/core/structures'
import NemuImage from '../nemu-image'

export default function ChatBubble({ message, current_user }: { message: ChatMessage; current_user?: boolean }) {
    function GetMessageStatus(status: ChatStatus, timestamp?: Date) {
        switch (status) {
            case ChatStatus.Failed:
                return 'Failed to send'
            case ChatStatus.Delivered:
                return 'Delivered'
            case ChatStatus.Seen:
                return `Seen at ${ConvertDateToLocaleString(timestamp!)}`
        }
    }

    function MessageContents(message_type: ChatMessageType) {
        switch (message_type) {
            case ChatMessageType.Text:
                return <p>{message.message}</p>
            case ChatMessageType.Image:
                return <NemuImage src={message.signed_url!} alt="photo" width={500} height={500} className="max-w-xs" />
            case ChatMessageType.Admin:
                return <>Admin</>
        }
    }

    return (
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
            <div className={ClassNames('chat-bubble p-4', current_user ? 'chat-bubble-primary text-base-content' : 'chat-bubble-accent')}>
                {MessageContents(message.message_type)}
            </div>
            <div className="chat-footer opacity-50 pt-1">{GetMessageStatus(message.status, message.seen_timestamp)}</div>
        </div>
    )
}
