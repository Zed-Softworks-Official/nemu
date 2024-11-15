'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@clerk/nextjs'
import {
    GroupChannelProvider,
    useGroupChannelContext
} from '@sendbird/uikit-react/GroupChannel/context'

import type { BaseMessage, UserMessage } from '@sendbird/chat/message'

import { Separator } from '~/components/ui/separator'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger
} from '~/components/ui/context-menu'

import { cn } from '~/lib/utils'

import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import {
    Dialog,
    DialogHeader,
    DialogTitle,
    DialogContent,
    DialogFooter
} from '~/components/ui/dialog'

import type { KanbanMessagesDataType } from '~/core/structures'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import { Label } from '~/components/ui/label'
import { api } from '~/trpc/react'

export function Channel(props: { channel_url: string | undefined }) {
    if (!props.channel_url) {
        return null
    }

    return (
        <GroupChannelProvider channelUrl={props.channel_url}>
            <CustomChannel />
        </GroupChannelProvider>
    )
}

function CustomChannel() {
    const [metadata, setMetadata] = useState<Record<string, string>>({})
    const [messageContent, setMessageContent] = useState('')
    const [kanbanOpen, setKanbanOpen] = useState(false)
    const [kanbanContainers, setKanbanContainers] = useState<
        KanbanMessagesDataType | undefined
    >(undefined)
    const [selectedKanbanContainerId, setSelectedKanbanContainerId] = useState<
        string | undefined
    >(undefined)
    const [selectedMessage, setSelectedMessage] = useState<BaseMessage | null>(null)

    const currentUser = useUser()

    const { currentChannel, messages, sendUserMessage, channelUrl } =
        useGroupChannelContext()

    const { data: kanbanData } = api.kanban.get_kanban_messages.useQuery(
        { sendbird_channel_url: channelUrl },
        {
            enabled: !!channelUrl
        }
    )

    const addToKanbanMutation = api.kanban.add_to_kanban.useMutation()

    useEffect(() => {
        if (kanbanData) {
            setKanbanContainers(kanbanData)
        }
        setMetadata(JSON.parse(currentChannel?.data ?? '{}') as Record<string, string>)
    }, [channelUrl, currentChannel, kanbanData])

    const otherUser = currentChannel?.members.find(
        (member) => member.userId !== currentUser.user?.id
    )

    return (
        <div className="flex flex-1 flex-col">
            <header className="p-4">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold">
                        {otherUser?.nickname ?? 'Other User'}
                    </h2>
                    <span className="text-md text-base-content/60">
                        {metadata.commission_title ?? 'Commission Title'}
                    </span>
                </div>
            </header>
            <Separator />
            <div className="flex-1 overflow-y-auto p-4">
                {messages.map((message) => (
                    <ContextMenu key={message.messageId}>
                        <ContextMenuTrigger>
                            <div
                                className={cn(
                                    'flex',
                                    (message as UserMessage).sender.userId ===
                                        currentUser.user?.id
                                        ? 'justify-end'
                                        : 'justify-start'
                                )}
                            >
                                <div
                                    className={cn(
                                        'max-w-[70%] rounded-xl p-3',
                                        (message as UserMessage).sender.userId ===
                                            currentUser.user?.id
                                            ? 'bg-primary'
                                            : 'bg-base-200',
                                        (message as UserMessage).sender.userId ===
                                            currentUser.user?.id
                                            ? 'rounded-br-none'
                                            : 'rounded-bl-none'
                                    )}
                                >
                                    Some Message
                                </div>
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                            {/* <ContextMenuItem>Reply</ContextMenuItem> */}
                            <ContextMenuItem
                                onClick={() => {
                                    setKanbanOpen(true)
                                    setSelectedMessage(message)
                                }}
                            >
                                Pin
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                ))}
            </div>
            <div className="flex w-full gap-2 p-5">
                <Input
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.currentTarget.value)}
                    placeholder="Type your message..."
                    className="bg-base-200 w-full"
                    type="text"
                />
                {/* <Button variant={'ghost'}>
                    <Paperclip className="h-4 w-4" />
                </Button> */}
                <Button
                    variant={'ghost'}
                    onClick={() => sendUserMessage({ message: messageContent })}
                >
                    <Send className="h-4 w-4" />
                </Button>
            </div>
            <Dialog open={kanbanOpen} onOpenChange={setKanbanOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add to Kanban Board</DialogTitle>
                    </DialogHeader>
                    <RadioGroup
                        value={selectedKanbanContainerId}
                        onValueChange={(value) => setSelectedKanbanContainerId(value)}
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="todo" id="todo" />
                            <Label htmlFor="todo">To Do</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="inProgress" id="inProgress" />
                            <Label htmlFor="inProgress">In Progress</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="done" id="done" />
                            <Label htmlFor="done">Done</Label>
                        </div>
                    </RadioGroup>
                    <DialogFooter>
                        <Button
                            onClick={async () => {
                                const toast_id = toast.loading('Adding to kanban')

                                if (
                                    !kanbanContainers?.id ||
                                    !selectedKanbanContainerId ||
                                    !selectedMessage
                                ) {
                                    toast.error('Failed to add to kanban', {
                                        id: toast_id
                                    })
                                    return
                                }

                                try {
                                    const res = await addToKanbanMutation.mutateAsync({
                                        kanban_id: kanbanContainers.id,
                                        container_id: selectedKanbanContainerId,
                                        content: selectedMessage.message
                                    })

                                    if (!res.success) {
                                        toast.error('Failed to add to kanban', {
                                            id: toast_id
                                        })
                                        return
                                    }

                                    toast.success('Added to kanban', {
                                        id: toast_id
                                    })
                                } catch (e) {
                                    console.error('Failed to add to kanban: ', e)
                                    toast.error('Failed to add to kanban', {
                                        id: toast_id
                                    })
                                }
                            }}
                        >
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
