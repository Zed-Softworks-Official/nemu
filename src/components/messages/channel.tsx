'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

import {
    GroupChannelProvider,
    useGroupChannelContext
} from '@sendbird/uikit-react/GroupChannel/context'

import type { FileMessage, UserMessage } from '@sendbird/chat/message'

import {
    MessageCircleMoreIcon,
    PaperclipIcon,
    PinIcon,
    ReplyIcon,
    SendIcon,
    XCircleIcon
} from 'lucide-react'

import { cn } from '~/lib/utils'

import NemuImage from '~/components/nemu-image'
import { useMessagesContext } from '~/components/messages/messages-context'

import { Button } from '~/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger
} from '~/components/ui/context-menu'

import type { SendbirdMetadata } from '~/sendbird/sendbird-structures'
import { toast } from 'sonner'
import { api } from '~/trpc/react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '~/components/ui/alert-dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'

/**
 * Shows the current channel messages and allows the user to send messages
 */
function CustomChannel() {
    const { currentChannel } = useGroupChannelContext()
    const { otherUser } = useMessagesContext()

    if (!currentChannel) {
        return null
    }

    const metadata = JSON.parse(
        currentChannel.data.replace(/'/g, '"')
    ) as SendbirdMetadata

    return (
        <div className="join-item h-full w-full bg-base-200">
            <div className="z-10 flex w-full flex-row items-center justify-between bg-base-200 p-5">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold">{otherUser?.nickname}</h2>
                    <span className="text-md text-base-content/60">
                        {metadata.commission_title}
                    </span>
                </div>
            </div>
            <div className="flex h-[27rem] flex-col overflow-auto p-5">
                <ChannelMessages />
            </div>
            <div className="flex w-full bg-base-200 p-5">
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
    const { replyMode, inputPlaceholder, replyMessage, cancel_reply } =
        useMessagesContext()

    const ref = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // Close modal if escape is pressed
        const closeOnEscapePressed = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (replyMode) {
                    cancel_reply()
                    ref.current!.innerText = ''
                }
            }
        }

        window.addEventListener('keydown', closeOnEscapePressed)
        return () => window.removeEventListener('keydown', closeOnEscapePressed)
    }, [cancel_reply, replyMode])

    return (
        <div className="relative flex w-full flex-col">
            {replyMode && (
                <motion.div
                    className="absolute -top-12 flex w-full flex-row items-center rounded-t-xl bg-base-300 px-5 py-2"
                    animate={{ y: -10 }}
                    transition={{ type: 'spring', duration: 0.2, bounce: 0.6 }}
                >
                    <div className="flex flex-col">
                        <span className="text-sm italic text-base-content/60">
                            Replying to
                        </span>
                        <p>{(replyMessage as UserMessage).message || ''}</p>
                    </div>
                    <Button variant={'ghost'} onMouseDown={() => cancel_reply()}>
                        <XCircleIcon className="h-6 w-6" />
                    </Button>
                </motion.div>
            )}
            <div
                className={cn(
                    'flex w-full cursor-text flex-row items-center justify-center rounded-xl bg-base-100 p-3',
                    replyMode && 'rounded-t-none'
                )}
            >
                <div
                    ref={ref}
                    contentEditable
                    className="join-item w-full text-base-content empty:before:content-[attr(data-placeholder)] focus:outline-none"
                    role="textarea"
                    data-placeholder={inputPlaceholder}
                    onInput={() => {
                        setMessageContent(ref.current?.innerText ?? '')
                    }}
                    onKeyDown={(e) => {
                        // If we press shift + enter, we don't want to send the message
                        if (e.shiftKey && e.key === 'Enter') return

                        // Exit reply mode
                        if (e.key === 'Escape') {
                            if (replyMode) {
                                cancel_reply()
                                ref.current!.innerText = ''
                            }
                        }

                        // Send the message
                        if (e.key === 'Enter') {
                            e.preventDefault()

                            if (messageContent.length === 0) return

                            if (replyMode) {
                                // Send the message as a reply
                                sendUserMessage({
                                    message: messageContent,
                                    isReplyToChannel: true,
                                    parentMessageId: replyMessage?.messageId
                                }).catch(() => {
                                    toast.error('Failed to send message!')
                                })
                            } else {
                                sendUserMessage({ message: messageContent }).catch(() => {
                                    toast.error('Failed to send message!')
                                })
                            }

                            setMessageContent('')
                            ref.current!.innerText = ''
                        }
                    }}
                ></div>
                <div className="join-item">
                    <Button
                        variant={'ghost'}
                        onMouseDown={() => {
                            if (messageContent === '') {
                                inputRef.current?.click()
                                return
                            }
                        }}
                    >
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
                    <input
                        className="hidden"
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpg,image/gif,video/mp4,video/mov"
                        max={1}
                        onChange={() => {
                            if (inputRef.current?.files?.length === 0) return

                            sendFileMessage({
                                file: inputRef.current?.files![0]
                            }).catch(() => {
                                toast.error('Failed to send file!')
                            })
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

/**
 * Shows all of the messages in the current channel
 */
function ChannelMessages() {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)
    const [selectedKanbanId, setSelectedKanbanId] = useState<string | undefined>(
        undefined
    )

    const { messages } = useGroupChannelContext()
    const { session, start_reply, metadata, kanbanData } = useMessagesContext()

    const mutation = api.kanban.add_to_kanban.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Adding to Kanban'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Added to Kanban', {
                id: toastId
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    if (messages.length === 0) {
        return (
            <div className="join-item flex h-full w-full flex-col items-center justify-center gap-5 bg-base-200">
                <MessageCircleMoreIcon className="h-10 w-10" />
                <h2 className="card-title">Nothing here yet!</h2>
            </div>
        )
    }

    return (
        <>
            {messages.map((message) => {
                let current_message: UserMessage | FileMessage | null = null

                if (message.isUserMessage()) {
                    current_message = message
                } else if (message.isFileMessage()) {
                    current_message = message
                }

                if (!current_message) return null

                const user_is_artist =
                    session.user?.publicMetadata.artist_id === metadata?.artist_id

                return (
                    <AlertDialog key={message.messageId}>
                        <ContextMenu key={message.messageId}>
                            <ContextMenuTrigger>
                                <ChatMessage message={current_message} />
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                                {user_is_artist && (
                                    <ContextMenuItem>
                                        <AlertDialogTrigger asChild>
                                            <div className="flex flex-row items-center gap-2">
                                                <PinIcon className="h-6 w-6" />
                                                Add to kanban
                                            </div>
                                        </AlertDialogTrigger>
                                    </ContextMenuItem>
                                )}
                                <ContextMenuItem
                                    onMouseDown={() => {
                                        start_reply(current_message)
                                    }}
                                >
                                    <ReplyIcon className="h-6 w-6" />
                                    Reply
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Which board would you like to add this to?
                                </AlertDialogTitle>
                            </AlertDialogHeader>
                            <div className="flex flex-col gap-5">
                                <Select
                                    onValueChange={(value) => {
                                        setSelectedKanbanId(value)
                                    }}
                                >
                                    <SelectTrigger className="bg-base-300">
                                        <SelectValue placeholder="Select your board" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {kanbanData?.containers.map((container) => (
                                            <SelectItem
                                                key={container.id}
                                                value={container.id.toString()}
                                            >
                                                {container.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogAction
                                    onMouseDown={() => {
                                        if (!selectedKanbanId) return

                                        mutation.mutate({
                                            kanban_id: kanbanData!.id,
                                            container_id: selectedKanbanId,
                                            content: current_message.isUserMessage()
                                                ? current_message.message
                                                : 'Not Valid'
                                        })
                                    }}
                                >
                                    Add to Kanban
                                </AlertDialogAction>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )
            })}
        </>
    )
}

function ChatMessage({
    message,
    className
}: {
    message: UserMessage | FileMessage
    className?: string
}) {
    const { session } = useMessagesContext()

    const chat_style =
        message.sender.userId === session.user?.id ? 'chat-end' : 'chat-start'

    if (message.isFileMessage()) {
        return (
            <div className={cn('chat', chat_style, className)}>
                <Avatar className="chat-image">
                    <AvatarImage src={message.sender.profileUrl} />
                    <AvatarFallback>
                        <div className="avatar skeleton h-10 w-10 rounded-full"></div>
                    </AvatarFallback>
                </Avatar>
                <div className="chat-footer">
                    <time className="text-xs opacity-50">
                        {new Date(message.createdAt).toLocaleTimeString('en-US', {
                            timeStyle: 'short'
                        })}
                    </time>
                </div>
                <NemuImage
                    src={message.url}
                    alt="image"
                    width={200}
                    height={200}
                    className="rounded-xl"
                />
            </div>
        )
    }

    return (
        <div className={cn('chat', chat_style, className)}>
            <Avatar className="chat-image">
                <AvatarImage src={message.sender.profileUrl} />
                <AvatarFallback>User</AvatarFallback>
            </Avatar>
            {message.parentMessage && message.parentMessage.isUserMessage() && (
                <div className="chat-header">
                    <ChatMessage message={message.parentMessage} className="opacity-50" />
                </div>
            )}
            <div className="chat-footer">
                <time className="text-xs opacity-50">
                    {new Date(message.createdAt).toLocaleTimeString('en-US', {
                        timeStyle: 'short'
                    })}
                </time>
            </div>
            <div
                className={cn(
                    'chat-bubble',
                    message.sender.userId === session.user?.id
                        ? 'chat-bubble-primary text-white'
                        : 'chat-bubble-accent'
                )}
            >
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
