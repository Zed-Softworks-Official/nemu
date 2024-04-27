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
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { BaseMessage, FileMessage, UserMessage } from '@sendbird/chat/message'

/**
 * Shows the current channel messages and allows the user to send messages
 */
function CustomChannel() {
    const { currentChannel } = useGroupChannelContext()

    return (
        <div className="join-item relative w-full overflow-scroll bg-base-200">
            <div className="absolute z-10 flex w-full flex-row items-center justify-between bg-base-200/60 p-5 backdrop-blur-xl">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold">{currentChannel?.name}</h2>
                    <span className="text-md text-base-content/60">Test Commission</span>
                </div>
            </div>
            <div className="flex h-full flex-col gap-5 p-5">
                <ChannelMessages />
            </div>
            <div className="absolute bottom-0 w-full bg-base-300 p-5">
                <ChannelTextInput />
            </div>
        </div>
    )
}

/**
 * The input field for the user to send messages
 */
function ChannelTextInput() {
    const [messageContent, setMessageContent] = useState<string>('')

    const { sendUserMessage, sendFileMessage } = useGroupChannelContext()
    const { replyMode, inputPlaceholder } = useMessagesContext()

    const ref = useRef<HTMLDivElement>(null)

    return (
        <div className="join flex w-full items-center justify-center rounded-xl bg-base-100 p-3">
            <div
                ref={ref}
                contentEditable
                className="join-item w-full cursor-text text-base-content empty:before:content-[attr(data-placeholder)] focus:outline-none"
                role="textarea"
                data-placeholder={inputPlaceholder}
                onInput={() => {
                    setMessageContent(ref.current?.innerText || '')
                }}
                onKeyDown={(e) => {
                    // If we press shift + enter, we don't want to send the message
                    if (e.shiftKey && e.key === 'Enter') return

                    // Exit reply mode
                    if (e.key === 'Escape') {
                    }

                    // Send the message
                    if (e.key === 'Enter') {
                        e.preventDefault()

                        if (messageContent.length === 0) return

                        if (replyMode) {
                            // Send the message as a reply
                        } else {
                            sendUserMessage({ message: messageContent })
                        }

                        setMessageContent('')
                        ref.current!.innerText = ''
                    }
                }}
            ></div>
            <div className="join-item">
                <Button variant={'ghost'}>
                    <div className="swap swap-rotate">
                        <SendIcon
                            className={cn(
                                'h-6 w-6',
                                messageContent ? 'swap-off' : 'swap-on'
                            )}
                        />
                        <PaperclipIcon
                            className={cn(
                                'h-6 w-6',
                                messageContent ? 'swap-on' : 'swap-off'
                            )}
                        />
                    </div>
                </Button>
            </div>
        </div>
    )
}

/**
 * Shows all of the messages in the current channel
 */
function ChannelMessages() {
    const { messages } = useGroupChannelContext()

    if (messages.length === 0) {
        return (
            <div className="join-item flex h-full w-full flex-col items-center justify-center gap-5 bg-base-200">
                <MessageCircleMoreIcon className="h-10 w-10" />
                <h2 className="card-title">Nothing here yet!</h2>
            </div>
        )
    }

    return (
        <div>
            {messages.map((message) => {
                let current_message

                if (message.isUserMessage()) {
                    current_message = message as UserMessage
                } else if (message.isFileMessage()) {
                    current_message = message as FileMessage
                }

                if (!current_message) return null

                return <ChatMessage message={current_message} />
            })}
        </div>
    )
}

function ChatMessage({ message }: { message: UserMessage | FileMessage }) {
    const { session } = useMessagesContext()

    const chat_style =
        message.sender.userId === session.user.id ? 'chat-end' : 'chat-start'

    if (message.isFileMessage()) {
        return (
            <div className={cn('chat', chat_style)}>
                <Avatar className="chat-image">
                    <AvatarImage src={message.sender.profileUrl} />
                    <AvatarFallback>User</AvatarFallback>
                </Avatar>
                <div className="chat-footer">
                    <time className="text-xs opacity-50">
                        {new Date(message.createdAt).toLocaleTimeString('en-US', {
                            timeStyle: 'short'
                        })}
                    </time>
                </div>
                <div className="chat-bubble">
                    <NemuImage src={message.url} alt="image" width={200} height={200} />
                </div>
            </div>
        )
    }

    return (
        <div className={cn('chat', chat_style)}>
            <Avatar className="chat-image">
                <AvatarImage src={message.sender.profileUrl} />
                <AvatarFallback>User</AvatarFallback>
            </Avatar>
            <div className="chat-footer">
                <time className="text-xs opacity-50">
                    {new Date(message.createdAt).toLocaleTimeString('en-US', {
                        timeStyle: 'short'
                    })}
                </time>
            </div>
            <div className="chat-bubble chat-bubble-primary text-white">
                {message.message}
            </div>
        </div>
    )
}

/**
 * The main component that links all of the channel components together to form the channel view
 */
export default function Channel() {
    const { currentChannel } = useMessagesContext()

    if (!currentChannel) {
        return (
            <div className="join-item flex h-full w-full flex-col items-center justify-center gap-5 bg-base-200">
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
