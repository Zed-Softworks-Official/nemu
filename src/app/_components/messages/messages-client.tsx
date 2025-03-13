'use client'

import { useRef, useState } from 'react'
import { MoreVerticalIcon, Send } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

import { cn } from '~/lib/utils'

import { Separator } from '~/app/_components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '~/app/_components/ui/avatar'
import { Button } from '~/app/_components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'
import TextareaAutosize from 'react-textarea-autosize'
import Loading from '~/app/_components/ui/loading'

import { type Message } from '~/lib/types'
import { MessagesProvider, useMessages } from './messages-context'
import { api } from '~/trpc/react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useUser } from '@clerk/nextjs'
import { usePusher } from '~/hooks/use-pusher'

export function MessagesClient(props: { listHidden?: boolean; currentOrderId?: string }) {
    return (
        <MessagesProvider current_order_id={props.currentOrderId}>
            <div className="bg-background-tertiary mx-auto flex h-[80vh] w-full rounded-xl shadow-xl">
                {!props.listHidden && (
                    <div className="flex w-full max-w-[400px] flex-col p-10">
                        <h1 className="text-xl font-bold">Commissions</h1>
                        <Separator className="my-5" />
                        <ChannelList />
                    </div>
                )}
                <div
                    className={cn(
                        'bg-background-secondary flex h-full w-full grow rounded-xl p-10',
                        {
                            'rounded-l-none': !props.listHidden
                        }
                    )}
                >
                    <MessageClientBody />
                </div>
            </div>
        </MessagesProvider>
    )
}

function MessageClientBody() {
    const { currentChatId, isLoading } = useMessages()

    if (!currentChatId || currentChatId === '') {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center">
                <Image
                    src={'/nemu/sad.png'}
                    alt="Sad Nemu"
                    width={200}
                    height={200}
                    className="mb-10"
                />
                <h1 className="text-xl font-bold">No Commission Selected</h1>
                <p className="text-muted-foreground text-sm">
                    Select a commission to start chatting with the artist
                </p>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center">
                <Loading />
            </div>
        )
    }

    return (
        <div className="flex h-full w-full flex-col">
            <MessagesHeader />
            <MessagesContent />
            <MessagesInput />
        </div>
    )
}

function MessagesContent() {
    const { messages, setMessages, currentUserId, currentChatId } = useMessages()
    const scrollDownRef = useRef<HTMLDivElement | null>(null)

    usePusher({
        key: `${currentChatId}:messages`,
        event_name: 'message',
        callback: (data: Message) => {
            if (data.sender.userId === currentUserId) return

            setMessages((prev) => [data, ...prev])
        }
    })

    return (
        <div className="flex h-full flex-1 flex-col-reverse gap-4 overflow-y-auto p-3">
            <div ref={scrollDownRef}></div>
            {messages.map((message, index) => (
                <Message
                    message={message}
                    currentUserId={currentUserId}
                    index={index}
                    key={message.id}
                />
            ))}
        </div>
    )
}

function MessagesInput() {
    const { chatPartner, currentChatId, setMessages } = useMessages()
    const { user } = useUser()

    const [input, setInput] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

    const sendMessage = api.chat.sendMessage.useMutation({
        onError: (e) => {
            toast.error(e.message)
        }
    })

    const handleSendMessage = (type: 'text' | 'image') => {
        if (!currentChatId || sendMessage.isPending || !input) return

        setMessages((prev) => [
            {
                id: crypto.randomUUID(),
                content: input,
                sender: {
                    userId: user?.id ?? 'unknown',
                    username: user?.username ?? 'unknown'
                },
                type: type,
                timestamp: Date.now()
            },
            ...prev
        ])

        sendMessage.mutate({
            chatId: currentChatId,
            text: input,
            type: type
        })

        setInput('')
        textareaRef.current?.focus()
    }

    return (
        <div className="mb-2 border-t px-4 pt-4 sm:mb-0">
            <div className="bg-background-tertiary ring-background-tertiary focus-within:ring-primary relative flex-1 overflow-hidden rounded-lg shadow-xs ring-1 focus-within:ring-2">
                <TextareaAutosize
                    ref={textareaRef}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage('text')
                        }
                    }}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Message ${chatPartner?.username}`}
                    className="rouned-lg block w-full resize-none border-0 bg-transparent outline-hidden sm:p-1.5 sm:text-sm sm:leading-6"
                />
                <div
                    onClick={() => textareaRef.current?.focus()}
                    className="py-2"
                    aria-hidden="true"
                >
                    <div className="py-px">
                        <div className="h-9"></div>
                    </div>
                </div>
                <div className="absolute right-0 bottom-0 flex justify-between py-2 pr-2 pl-3">
                    <div className="shrink-0">
                        <Button
                            disabled={!currentChatId || sendMessage.isPending}
                            variant={'ghost'}
                            size={'icon'}
                            onClick={() => handleSendMessage('text')}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function ChannelList() {
    const { data: chats, isLoading } = api.chat.getChats.useQuery()
    const { setCurrentChatId } = useMessages()

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="flex flex-col gap-5">
            {chats?.map((chat) => (
                <div
                    key={chat.id}
                    className="bg-background hover:bg-primary flex cursor-pointer items-center gap-2 rounded-xl p-5 transition-colors duration-200 ease-in-out"
                    onClick={() => setCurrentChatId(chat.request.orderId)}
                >
                    <Avatar>
                        <AvatarImage src={chat.other_user.profile_image} />
                        <AvatarFallback>
                            {chat.other_user.username?.at(0) ?? 'N'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-lg font-bold">{chat.other_user.username}</h1>
                        <h2 className="text-md text-muted-foreground">
                            {chat.commission.title ?? 'No Commission Title'}
                        </h2>
                    </div>
                </div>
            ))}
        </div>
    )
}

function MessagesHeader() {
    const { chatPartner, commissionTitle } = useMessages()

    return (
        <div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <Avatar>
                        <AvatarImage src={chatPartner?.profileImage} />
                        <AvatarFallback>
                            {chatPartner?.username?.at(0) ?? 'N'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <h1 className="text-lg font-bold">
                            <Link
                                href={`/@${chatPartner?.username}`}
                                className="hover:underline"
                            >
                                {chatPartner?.username}
                            </Link>
                        </h1>
                        <h2 className="text-md text-muted-foreground">
                            {commissionTitle ?? 'No Commission Title'}
                        </h2>
                    </div>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant={'ghost'}>
                            <MoreVerticalIcon className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem>View Commission</DropdownMenuItem>
                        <DropdownMenuItem>View Request</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <Separator className="my-5" />
        </div>
    )
}

function Message(props: {
    message: Message
    currentUserId: string | undefined
    index: number
}) {
    const { messages, chatPartner } = useMessages()
    const { user } = useUser()

    const isCurrentUser = props.message.sender.userId === props.currentUserId
    const concurrentMessage =
        messages[props.index - 1]?.sender.userId === props.message.sender.userId

    const formatTimestamp = (timestamp: number) => format(timestamp, 'HH:mm')
    const imageUrl = isCurrentUser ? user?.imageUrl : chatPartner?.profileImage

    return (
        <div className={cn('flex items-end', { 'justify-end': isCurrentUser })}>
            <div
                className={cn('mx-2 flex max-w-xs flex-col space-y-2 text-base', {
                    'order-1 items-end': isCurrentUser,
                    'order-2 items-start': !isCurrentUser
                })}
            >
                <span
                    className={cn('inline-block rounded-lg px-4 py-2', {
                        'bg-primary text-foreground': isCurrentUser,
                        'bg-background-tertiary': !isCurrentUser,
                        'rounded-br-none': !concurrentMessage && isCurrentUser,
                        'rounded-bl-none': !concurrentMessage && !isCurrentUser
                    })}
                >
                    {props.message.content}{' '}
                    <span className="text-muted-foreground ml-2 text-xs">
                        {formatTimestamp(props.message.timestamp)}
                    </span>
                </span>
            </div>
            <Avatar
                className={cn('h-10 w-10', {
                    'order-1': isCurrentUser,
                    invisible: concurrentMessage
                })}
            >
                <AvatarImage src={imageUrl} />
                <AvatarFallback>
                    {props.message.sender.username?.at(0) ?? 'N'}
                </AvatarFallback>
            </Avatar>
        </div>
    )
}
