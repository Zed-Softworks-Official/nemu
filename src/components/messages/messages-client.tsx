'use client'

import { useEffect, useRef } from 'react'
import { MoreVerticalIcon, Paperclip, Send } from 'lucide-react'
import Link from 'next/link'

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
import { Input } from '~/components/ui/input'

import { type Message } from '~/core/structures'
import { MessagesProvider, useMessages } from './messages-context'

export function MessagesClient(props: { list_hidden?: boolean }) {
    return (
        <MessagesProvider>
            <div className="mx-auto flex h-[80vh] w-full rounded-xl bg-background-tertiary shadow-xl">
                {!props.list_hidden && (
                    <div className="flex w-full max-w-[400px] flex-col p-10">
                        <h1 className="text-xl font-bold">Commissions</h1>
                        <Separator className="my-5" />
                        <ChannelList />
                    </div>
                )}
                <div className="flex h-full w-full flex-grow rounded-xl rounded-l-none bg-background-secondary p-10">
                    <div className="flex h-full w-full flex-col">
                        <MessagesHeader />
                        <MessagesContent />
                        <MessagesInput />
                    </div>
                </div>
            </div>
        </MessagesProvider>
    )
}

function MessagesContent() {
    const { messages } = useMessages()
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Directly set scrollTop to the maximum value
        const container = messagesEndRef.current?.parentElement
        if (container) {
            container.scrollTop = container.scrollHeight
        }
    }, [])

    return (
        <div className="flex w-full flex-grow flex-col justify-end gap-5 overflow-y-auto">
            <div className="flex flex-col gap-5 overflow-y-auto">
                {messages.map((message, index) => (
                    <Message message={message} key={index} />
                ))}
                <div ref={messagesEndRef} />
            </div>
        </div>
    )
}

function MessagesInput() {
    return (
        <div className="flex flex-col">
            <Separator className="my-5" />
            <div className="flex w-full justify-between gap-5">
                <Input
                    placeholder="Send a message"
                    className="w-full bg-background-tertiary"
                />
                <Button variant={'ghost'}>
                    <Paperclip className="h-6 w-6" />
                </Button>
                <Button>
                    <Send className="h-6 w-6" />
                </Button>
            </div>
        </div>
    )
}

function ChannelList() {
    return (
        <div className="flex flex-col gap-5">
            <div className="flex cursor-pointer items-center gap-2 rounded-xl bg-background p-5 transition-colors duration-200 ease-in-out hover:bg-primary">
                <Avatar>
                    <AvatarImage src="https://cdn.bsky.app/img/avatar/plain/did:plc:n32jyuweechdnkfnkwnyndep/bafkreigj7z7odl4zz66piwbo32vz7d735cy623vfnu2qwwzkyu5qwqregm@jpeg" />
                    <AvatarFallback>JS</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                    <h1 className="text-lg font-bold">@JackSchitt404</h1>
                    <h2 className="text-md text-muted-foreground">Commission Title</h2>
                </div>
            </div>
        </div>
    )
}

function MessagesHeader() {
    return (
        <div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <Avatar>
                        <AvatarImage src="https://cdn.bsky.app/img/avatar/plain/did:plc:n32jyuweechdnkfnkwnyndep/bafkreigj7z7odl4zz66piwbo32vz7d735cy623vfnu2qwwzkyu5qwqregm@jpeg" />
                        <AvatarFallback>JS</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <h1 className="text-lg font-bold">
                            <Link href={'/@JackSchitt404'} className="hover:underline">
                                @JackSchitt404
                            </Link>
                        </h1>
                        <h2 className="text-md text-muted-foreground">
                            Commission Title
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
                        <DropdownMenuItem>View Attachments</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <Separator className="my-5" />
        </div>
    )
}

function Message(props: { message: Message }) {
    return (
        <div
            className={cn(
                'flex items-center gap-2',
                props.message.sender.user_id === 'vercel' && 'justify-end',
                props.message.sender.user_id === 'JackSchitt404' && 'justify-start'
            )}
        >
            {props.message.sender.user_id === 'JackSchitt404' && (
                <Avatar>
                    <AvatarImage src="https://cdn.bsky.app/img/avatar/plain/did:plc:n32jyuweechdnkfnkwnyndep/bafkreigj7z7odl4zz66piwbo32vz7d735cy623vfnu2qwwzkyu5qwqregm@jpeg" />
                    <AvatarFallback>JS</AvatarFallback>
                </Avatar>
            )}
            <div
                className={cn(
                    'flex max-w-[30%] rounded-xl px-5 py-2',
                    props.message.sender.user_id === 'vercel' &&
                        'rounded-br-none bg-primary',
                    props.message.sender.user_id === 'JackSchitt404' &&
                        'rounded-bl-none bg-background-secondary'
                )}
            >
                <p>{props.message.content}</p>
            </div>
            {props.message.sender.user_id === 'vercel' && (
                <Avatar>
                    <AvatarImage src="https://github.com/kzolt.png" />
                    <AvatarFallback>JS</AvatarFallback>
                </Avatar>
            )}
        </div>
    )
}
