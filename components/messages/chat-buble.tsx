'use client'

import { useSession } from 'next-auth/react'
import NemuImage from '../nemu-image'
import classNames from '@/helpers/classnames'

export default function ChatBubble({
    username,
    profile_photo,
    timestamp,
    message,
    status
}: {
    username: string
    profile_photo: string
    timestamp: string
    message: string
    status: string
}) {
    const { data } = useSession()

    return (
        <div
            className={classNames(
                'chat',
                data?.user.name == username ? ' chat-end' : 'chat-start'
            )}
        >
            <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                    <NemuImage
                        alt={'Profile Photo'}
                        src={profile_photo}
                        width={50}
                        height={50}
                    />
                </div>
            </div>
            <div className="chat-header">
                {username}
                <time className="text-xs opacity-50">{timestamp}</time>
            </div>
            <div
                className={classNames(
                    'chat-bubble p-2',
                    data?.user.name == username ? 'chat-bubble-primary text-white' : ''
                )}
            >
                {message}
            </div>
            <div className="chat-footer opacity-50">{status}</div>
        </div>
    )
}
