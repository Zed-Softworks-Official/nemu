'use client'

import { MessagePreview } from '@/core/structures'
import { ClassNames, ConvertDateToLocaleString } from '@/core/helpers'
import { MouseEventHandler, useState } from 'react'
import { api } from '@/core/trpc/react'

export default function MessagesCard({
    message_preview,
    selected,
    onClick
}: {
    message_preview: MessagePreview
    selected?: boolean
    onClick?: MouseEventHandler<HTMLDivElement> | undefined
}) {
    const { data, isLoading } = api.form.get_submission.useQuery({
        channel_url: message_preview.channel_url
    })

    const [mouseOver, setMouseOver] = useState(false)

    if (isLoading) {
        return (
            <div className="card bg-base-100">
                <div className="card-body">
                    <div className="flex justify-between gap-2">
                        <div className="flex flex-col gap-2">
                            <div className="skeleton w-36 h-5"></div>
                            <div className="skeleton w-24 h-5"></div>
                        </div>
                        <div className="skeleton w-10 h-5"></div>
                    </div>
                    <div className="flex flex-col w-full gap-2 pt-5">
                        <div className="w-full skeleton h-4"></div>
                        <div className="w-[85%] skeleton h-4"></div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            className={ClassNames(
                'card cursor-pointer transition-all duration-200 w-full',
                selected
                    ? 'bg-primary shadow-xl'
                    : 'bg-base-100 hover:bg-primary hover:shadow-xl'
            )}
            onMouseEnter={() => {
                setMouseOver(true)
            }}
            onMouseLeave={() => {
                setMouseOver(false)
            }}
            onClick={onClick}
        >
            {message_preview.unread_messages && (
                <div className="indicator">
                    <span className="indicator-item badge badge-primary"></span>
                </div>
            )}
            <div className="card-body">
                <div className="flex justify-between gap-2">
                    <div className="flex flex-col gap-2 ">
                        <h2 className="font-bold font-lg">
                            {message_preview.channel_name}
                        </h2>
                        <span
                            className={ClassNames(
                                'badge badge-lg',
                                selected && 'badge-outline badge-accent',
                                !selected && mouseOver
                                    ? 'badge-outline badge-accent'
                                    : 'badge-primary'
                            )}
                        >
                            {data?.submission.form.commission?.title}
                        </span>
                    </div>
                    {message_preview.late_message_timestamp && (
                        <time className="text-xs ml-2">
                            {ConvertDateToLocaleString(
                                message_preview.late_message_timestamp
                            )}
                        </time>
                    )}
                </div>
                {message_preview.last_message && (
                    <p className="font-md overflow-ellipsis pt-5">
                        {message_preview.last_message_current_user
                            ? 'Me: '
                            : `${message_preview.other_username}: `}
                        {message_preview.last_message}
                    </p>
                )}
            </div>
        </div>
    )
}
