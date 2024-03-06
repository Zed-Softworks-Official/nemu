'use client'

import { MessagePreview } from '@/core/structures'
import { ClassNames, ConvertDateToLocaleString, GraphQLFetcher } from '@/core/helpers'
import { DOMAttributes, MouseEventHandler, useState } from 'react'
import useSWR from 'swr'
import Loading from '../loading'

export default function MessagesCard({
    message_preview,
    selected,
    onClick
}: {
    message_preview: MessagePreview
    selected?: boolean
    onClick?: MouseEventHandler<HTMLDivElement> | undefined
}) {
    const { data, isLoading } = useSWR(
        `{
            form_submission(channel_url:"${message_preview.channel_url}") {
                form {
                    commission {
                        title
                    }
                }
            }
        }`,
        GraphQLFetcher<{
            form_submission: {
                form: {
                    commission: {
                        title: string
                    }
                }
            }
        }>
    )

    const [mouseOver, setMouseOver] = useState(false)

    if (isLoading) {
        return <Loading />
    }

    return (
        <div
            className={ClassNames(
                'card cursor-pointer transition-all duration-200 w-full',
                selected ? 'bg-primary shadow-xl' : 'bg-base-100 hover:bg-primary hover:shadow-xl'
            )}
            onMouseEnter={() => {
                setMouseOver(true)
            }}
            onMouseLeave={() => {
                setMouseOver(false)
            }}
            onClick={onClick}
        >
            <div className="card-body">
                <div className="flex justify-between gap-2">
                    <div className="flex flex-col gap-2 ">
                        <h2 className="font-bold font-lg">{message_preview.other_username}</h2>
                        <span
                            className={ClassNames(
                                'badge badge-lg',
                                selected && 'badge-outline badge-accent',
                                !selected && mouseOver ? 'badge-outline badge-accent' : 'badge-primary'
                            )}
                        >
                            {data?.form_submission.form.commission.title}
                        </span>
                    </div>
                    {message_preview.late_message_timestamp && (
                        <time className="text-xs ml-2">{ConvertDateToLocaleString(message_preview.late_message_timestamp)}</time>
                    )}
                </div>
                {message_preview.last_message && (
                    <p className="font-md overflow-ellipsis pt-5">
                        {message_preview.last_message_current_user ? 'Me: ' : `${message_preview.other_username}: `}
                        {message_preview.last_message}
                    </p>
                )}
            </div>
        </div>
    )
}
