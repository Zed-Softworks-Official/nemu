'use client'

import {
    GroupChannelProvider,
    useGroupChannelContext
} from '@sendbird/uikit-react/GroupChannel/context'
import { useMessagesContext } from './messages-context'
import { MessageCircleMoreIcon, PaperclipIcon, SendIcon } from 'lucide-react'
import NemuImage from '../nemu-image'
import { useRef, useState } from 'react'
import { Button } from '../ui/button'
import { cn } from '~/lib/utils'

function CustomChannel() {
    const { currentChannel } = useGroupChannelContext()

    return (
        <div className="bg-base-200 join-item w-full relative">
            <div className="bg-base-200/60 backdrop-blur-xl flex flex-row justify-between items-center absolute p-5 w-full">
                <div className="flex flex-col">
                    <h2 className="font-bold text-xl">{currentChannel?.name}</h2>
                    <span className="text-base-content/60 text-md">Test Commission</span>
                </div>
            </div>
            <div className="flex flex-col gap-5 p-5 h-full">
                <ChannelMessages />
            </div>
            <div className="absolute bg-base-300 w-full bottom-0 p-5">
                <ChannelTextInput />
            </div>
        </div>
    )
}

function ChannelTextInput() {
    const [messageContent, setMessageContent] = useState<string>('')

    const { sendUserMessage, sendFileMessage } = useGroupChannelContext()
    const { replyMode, inputPlaceholder } = useMessagesContext()

    const ref = useRef<HTMLDivElement>(null)

    return (
        <div className="join bg-base-100 p-3 rounded-xl w-full flex items-center justify-center">
            <div
                ref={ref}
                contentEditable
                className="text-base-content cursor-text focus:outline-none empty:before:content-[attr(data-placeholder)] join-item w-full"
                role="textarea"
                data-placeholder={inputPlaceholder}
                onInput={() => {
                    setMessageContent(ref.current?.innerText || '')
                }}
            ></div>
            <div className="join-item">
                <Button variant={'ghost'}>
                    <div className="swap swap-rotate">
                        <SendIcon
                            className={cn(
                                'w-6 h-6',
                                messageContent ? 'swap-off' : 'swap-on'
                            )}
                        />
                        <PaperclipIcon
                            className={cn(
                                'w-6 h-6',
                                messageContent ? 'swap-on' : 'swap-off'
                            )}
                        />
                    </div>
                </Button>
            </div>
        </div>
    )
}

function ChannelMessages() {
    const { messages } = useGroupChannelContext()

    if (messages.length === 0) {
        return (
            <div className="flex flex-col gap-5 bg-base-200 join-item w-full h-full items-center justify-center">
                <MessageCircleMoreIcon className="w-10 h-10" />
                <h2 className="card-title">Nothing here yet!</h2>
            </div>
        )
    }

    return <>Contents</>
}

export default function Channel() {
    const { currentChannel } = useMessagesContext()

    if (!currentChannel) {
        return (
            <div className="flex flex-col gap-5 bg-base-200 join-item w-full h-full items-center justify-center">
                <NemuImage
                    src={'/nemu/this-is-fine.png'}
                    alt="Nemu Sparkles"
                    width={150}
                    height={150}
                    priority
                />
                <h2 className="card-title">No channel slected</h2>
            </div>
        )
    }

    return (
        <GroupChannelProvider channelUrl={currentChannel}>
            <CustomChannel />
        </GroupChannelProvider>
    )
}
