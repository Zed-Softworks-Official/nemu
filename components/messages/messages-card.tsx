'use client'

import { MessagePreview } from '@/core/structures'
import { ClassNames, ConvertDateToLocaleString } from '@/core/helpers'
import { DOMAttributes, MouseEventHandler } from 'react'

export default function MessagesCard({
    message_preview,
    selected,
    onClick
}: {
    message_preview: MessagePreview
    selected?: boolean
    onClick?: MouseEventHandler<HTMLDivElement> | undefined
}) {
    return (
        <div
            className={ClassNames(
                'card cursor-pointer transition-all duration-200',
                selected ? 'bg-primary shadow-xl' : 'bg-base-100 hover:bg-primary hover:shadow-xl'
            )}
            onClick={onClick}
        >
            <div className="card-body">
                <div className="flex justify-between items-center">
                    <h2 className="font-bold font-lg">{message_preview.other_username}</h2>
                    <time className="text-xs ml-2">{ConvertDateToLocaleString(message_preview.late_message_timestamp)}</time>
                </div>
                <p className="font-md overflow-ellipsis">
                    {message_preview.last_message_current_user ? 'Me: ' : `${message_preview.other_username}: `}
                    {message_preview.last_message}
                </p>
            </div>
        </div>
    )
}
