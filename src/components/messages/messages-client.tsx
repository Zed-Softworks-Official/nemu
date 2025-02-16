'use client'

import { useRef, useState } from 'react'
import { MoreVerticalIcon, Send } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

import { cn } from '~/lib/utils'

import { Separator } from '~/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import TextareaAutosize from 'react-textarea-autosize'
import Loading from '~/components/ui/loading'

import { type Message } from '~/lib/structures'
import { MessagesProvider, useMessages } from './messages-context'
import { api } from '~/trpc/react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useUser } from '@clerk/nextjs'
import { usePusher } from '~/hooks/use-pusher'

export function MessagesClient(props: {
    list_hidden?: boolean
    current_order_id?: string
}) {
    return (
        <MessagesProvider current_order_id={props.current_order_id}>
            <div className="mx-auto flex h-[80vh] w-full rounded-xl bg-background-tertiary shadow-xl">
                {!props.list_hidden && (
                    <div className="flex w-full max-w-[400px] flex-col p-10">
                        <h1 className="text-xl font-bold">Commissions</h1>
                        <Separator className="my-5" />
                        <ChannelList />
                    </div>
                )}
                <div
                    className={cn(
                        'flex h-full w-full grow rounded-xl bg-background-secondary p-10',
                        {
                            'rounded-l-none': !props.list_hidden
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
    const { current_chat_id, is_loading } = useMessages()

    if (!current_chat_id || current_chat_id === '') {
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
                <p className="text-sm text-muted-foreground">
                    Select a commission to start chatting with the artist
                </p>
            </div>
        )
    }

    if (is_loading) {
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
    const { messages, set_messages, current_user_id, current_chat_id } = useMessages()
    const scrollDownRef = useRef<HTMLDivElement | null>(null)

    usePusher({
        key: `${current_chat_id}:messages`,
        event_name: 'message',
        callback: (data: Message) => {
            if (data.sender.user_id === current_user_id) return

            set_messages((prev) => [data, ...prev])
        }
    })

    return (
        <div className="flex h-full flex-1 flex-col-reverse gap-4 overflow-y-auto p-3">
            <div ref={scrollDownRef}></div>
            {messages.map((message, index) => (
                <Message
                    message={message}
                    current_user_id={current_user_id}
                    index={index}
                    key={message.id}
                />
            ))}
        </div>
    )
}

function MessagesInput() {
    const { chat_partner, current_chat_id, set_messages } = useMessages()
    const { user } = useUser()

    const [input, setInput] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

    const sendMessage = api.chat.send_message.useMutation({
        onError: (e) => {
            toast.error(e.message)
        }
    })

    const handleSendMessage = (type: 'text' | 'image') => {
        if (!current_chat_id || sendMessage.isPending || !input) return

        set_messages((prev) => [
            {
                id: crypto.randomUUID(),
                content: input,
                sender: {
                    user_id: user?.id ?? 'unknown',
                    username: user?.username ?? 'unknown'
                },
                type: type,
                timestamp: Date.now()
            },
            ...prev
        ])

        sendMessage.mutate({
            chat_id: current_chat_id,
            text: input,
            type: type
        })

        setInput('')
        textareaRef.current?.focus()
    }

    return (
        <div className="mb-2 border-t px-4 pt-4 sm:mb-0">
            <div className="relative flex-1 overflow-hidden rounded-lg bg-background-tertiary shadow-xs ring-1 ring-background-tertiary focus-within:ring-2 focus-within:ring-primary">
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
                    placeholder={`Message ${chat_partner?.username}`}
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
                <div className="absolute bottom-0 right-0 flex justify-between py-2 pl-3 pr-2">
                    <div className="shrink-0">
                        <Button
                            disabled={!current_chat_id || sendMessage.isPending}
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
    const { data: chats, isLoading } = api.chat.get_chats.useQuery()
    const { set_current_chat_id: set_current_order_id } = useMessages()

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="flex flex-col gap-5">
            {chats?.map((chat) => (
                <div
                    key={chat.id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl bg-background p-5 transition-colors duration-200 ease-in-out hover:bg-primary"
                    onClick={() => set_current_order_id(chat.request.order_id)}
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
    const { chat_partner, commission_title } = useMessages()

    return (
        <div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <Avatar>
                        <AvatarImage src={chat_partner?.profile_image} />
                        <AvatarFallback>
                            {chat_partner?.username?.at(0) ?? 'N'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <h1 className="text-lg font-bold">
                            <Link
                                href={`/@${chat_partner?.username}`}
                                className="hover:underline"
                            >
                                {chat_partner?.username}
                            </Link>
                        </h1>
                        <h2 className="text-md text-muted-foreground">
                            {commission_title ?? 'No Commission Title'}
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
    current_user_id: string | undefined
    index: number
}) {
    const { messages, chat_partner } = useMessages()
    const { user } = useUser()

    const is_current_user = props.message.sender.user_id === props.current_user_id
    const concurrent_message =
        messages[props.index - 1]?.sender.user_id === props.message.sender.user_id

    const formatTimestamp = (timestamp: number) => format(timestamp, 'HH:mm')
    const image_url = is_current_user ? user?.imageUrl : chat_partner?.profile_image

    return (
        <div className={cn('flex items-end', { 'justify-end': is_current_user })}>
            <div
                className={cn('mx-2 flex max-w-xs flex-col space-y-2 text-base', {
                    'order-1 items-end': is_current_user,
                    'order-2 items-start': !is_current_user
                })}
            >
                <span
                    className={cn('inline-block rounded-lg px-4 py-2', {
                        'bg-primary text-foreground': is_current_user,
                        'bg-background-tertiary': !is_current_user,
                        'rounded-br-none': !concurrent_message && is_current_user,
                        'rounded-bl-none': !concurrent_message && !is_current_user
                    })}
                >
                    {props.message.content}{' '}
                    <span className="ml-2 text-xs text-muted-foreground">
                        {formatTimestamp(props.message.timestamp)}
                    </span>
                </span>
            </div>
            <Avatar
                className={cn('h-10 w-10', {
                    'order-1': is_current_user,
                    invisible: concurrent_message
                })}
            >
                <AvatarImage src={image_url} />
                <AvatarFallback>
                    {props.message.sender.username?.at(0) ?? 'N'}
                </AvatarFallback>
            </Avatar>
        </div>
    )
}
