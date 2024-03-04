'use client'

import { MessagePreview } from '@/core/structures'
import { ClassNames, ConvertDateToLocaleString } from '@/core/helpers'

export default function MessagesCard({ message_preview, selected }: { message_preview: MessagePreview; selected?: boolean }) {
    return (
        <div className={ClassNames('card cursor-pointer transition-all duration-200', selected ? 'bg-primary shadow-xl' : 'bg-base-100 hover:bg-primary hover:shadow-xl')}>
            <div className="card-body">
                <div className="flex justify-between items-center">
                    <h2 className="font-bold font-lg">{message_preview.other_username}</h2>
                    <time className="text-xs ml-2">{ConvertDateToLocaleString(new Date())}</time>
                </div>
                <p className="font-md overflow-ellipsis">
                    {message_preview.last_message_current_user ? 'Me: ' : `${message_preview.other_username}: `}
                    {message_preview.last_message}
                </p>
            </div>
        </div>
    )
}
