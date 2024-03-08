'use client'
import { Bars3Icon, ChatBubbleOvalLeftEllipsisIcon, PaperAirplaneIcon, PaperClipIcon } from '@heroicons/react/20/solid'
import ChatBubble from './chat-buble'
import { ChatMessageType, ChatStatus, KanbanContainerData, KanbanTask } from '@/core/structures'
import { useSession } from 'next-auth/react'
import { Transition } from '@headlessui/react'
import { MouseEvent, useEffect, useRef, useState } from 'react'
import NemuImage from '../nemu-image'

import { GroupChannelUI } from '@sendbird/uikit-react/GroupChannel/components/GroupChannelUI'
import { GroupChannelProvider, useGroupChannelContext } from '@sendbird/uikit-react/GroupChannel/context'
import { BaseMessage, FileMessage, MessageType, SendingStatus, UserMessage } from '@sendbird/chat/message'
import { EveryMessage } from '@sendbird/uikit-react/'

import Loading from '../loading'
import ChannelSettings from './channel-settings'
import { ClassNames, GraphQLFetcher } from '@/core/helpers'
import MessagesContextMenu from './messages-context-menu'
import { useMessagesContext } from './messages-context'
import MessagesModal from '../messages-modal'
import { toast } from 'react-toastify'
import { NemuResponse, StatusCode } from '@/core/responses'
import { BsReplyFill } from 'react-icons/bs'

const initialContextMenu = {
    show: false,
    x: 0,
    y: 0
}

function CustomChannel() {
    const { currentChannel, sendUserMessage, sendFileMessage, deleteMessage } = useGroupChannelContext()
    const {
        setMessage,
        editingId,
        deletingMessage,
        setDeletingMessage,
        kanbanId,
        messageToAddToKanban,
        setMessageToAddToKanban,
        replyMessage,
        setReplyMessage,
        placeholder,
        setPlaceholder
    } = useMessagesContext()!
    const { data: session } = useSession()

    const [messageContent, setMessageContent] = useState('')
    const [contextMenu, setContextMenu] = useState(initialContextMenu)

    const [showDetail, setShowDetail] = useState(false)
    const [showDeletingModal, setShowDeletingModal] = useState(false)
    const [showKanbanModal, setShowKanbanModal] = useState(false)

    const [kanbanContainers, setKanbanConatiners] = useState<KanbanContainerData[] | undefined>(undefined)

    const ref = useRef<HTMLSpanElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // Check if the value has changed for any of these variables
        setShowDeletingModal(deletingMessage != undefined)
        setShowKanbanModal(messageToAddToKanban != undefined)

        if (messageToAddToKanban != undefined && kanbanId) {
            GraphQLFetcher<{
                kanban: {
                    containers: string
                    tasks: string
                }
            }>(
                `{
                    kanban(id:"${kanbanId}") {
                        containers
                    }
                }`
            ).then((response: { kanban: { containers: string; tasks: string } }) => {
                setKanbanConatiners(JSON.parse(response.kanban.containers) as KanbanContainerData[])
            })
        }
    }, [deletingMessage, messageToAddToKanban])

    function ConvertSendbirdToNemuMessageType(message_type: MessageType | undefined) {
        if (!message_type) {
            return undefined
        }

        switch (message_type) {
            case MessageType.BASE:
                return ChatMessageType.Text
            case MessageType.USER:
                return ChatMessageType.Text
            case MessageType.ADMIN:
                return ChatMessageType.Admin
            case MessageType.FILE:
                return ChatMessageType.Image
        }
    }

    function ConvertSendbirdToNemuStatus(status: SendingStatus, message: BaseMessage) {
        // Check if the message has been read
        if (status === SendingStatus.SUCCEEDED && currentChannel?.getUnreadMemberCount(message) === 0) {
            return ChatStatus.Read
        }

        // Check if the message has been delivered
        if (status === SendingStatus.SUCCEEDED && currentChannel?.getUndeliveredMemberCount(message) === 0) {
            return ChatStatus.Delivered
        }

        // Check if the message failed
        if (status === SendingStatus.FAILED) {
            return ChatStatus.Failed
        }

        return ChatStatus.Sent
    }

    function HandleContextMenu(e: MouseEvent<HTMLDivElement, globalThis.MouseEvent>, message: EveryMessage) {
        e.preventDefault()

        const { pageX, pageY } = e
        setContextMenu({ show: true, x: pageX, y: pageY })
        setMessage(message)
    }

    function HandleButtonStates() {
        if (ref.current == undefined) {
            return
        }

        // We are in attachment mode
        if (messageContent === '') {
            // Get the file
            inputRef.current?.click()
        } else {
            // We are in send mode
            SendMessageContent()
        }
    }

    function SendMessageContent() {
        if (messageContent == '') return

        sendUserMessage({
            message: messageContent
        })
        setMessageContent('')
        ref.current!.innerText! = ''
    }

    function ReplyMessageContent() {
        if (messageContent == '') return

        sendUserMessage({
            message: messageContent,
            isReplyToChannel: true,
            parentMessageId: replyMessage?.messageId
        })
        setMessageContent('')
        ref.current!.innerText! = ''

        setReplyMessage(undefined)
        setPlaceholder('Send Message')
    }

    return (
        <div className="w-full join-item relative">
            <GroupChannelUI
                renderPlaceholderInvalid={() => (
                    <div className="flex flex-col w-full h-full bg-base-100 justify-center items-center gap-5">
                        <NemuImage src="/nemu/sad.png" alt="Sad nemu" width={200} height={200} />
                        <h2 className="card-title">There's no channel selected</h2>
                    </div>
                )}
                renderPlaceholderEmpty={() => (
                    <div className="flex flex-col w-full h-full bg-base-100 justify-center items-center gap-5 text-base-content/80">
                        <ChatBubbleOvalLeftEllipsisIcon className="w-20 h-20" />
                        <h2 className="card-title">No Messages</h2>
                    </div>
                )}
                renderPlaceholderLoader={() => (
                    <div className="flex flex-col w-full h-full bg-base-100 justify-center items-center">
                        <Loading />
                    </div>
                )}
                renderChannelHeader={() => (
                    <div className="flex w-full p-5 justify-between items-center bg-base-200">
                        <h2 className="card-title">{currentChannel?.name}</h2>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                                setShowDetail(true)
                            }}
                        >
                            <Bars3Icon className="w-6 h-6" />
                        </button>
                    </div>
                )}
                renderMessageInput={() => (
                    <div className="w-[96%] justify-center items-center mx-auto">
                        <Transition
                            show={replyMessage != undefined}
                            enter="transition-all duration-150"
                            enterFrom="opacity-0 translate-y-20"
                            enterTo="opacity-100"
                            leave="transition-all duration-150"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0 translate-y-20"
                        >
                            <div className="bg-base-200 p-5 rounded-t-xl flex flex-col">
                                <div className="flex flex-row items-center">
                                    <BsReplyFill className="w-5 h-5" />
                                    <p className="text-sm">Replying to</p>
                                </div>
                                <p className="text-sm">{replyMessage?.isUserMessage() && replyMessage.message}</p>
                            </div>
                        </Transition>
                        <div
                            className={ClassNames(
                                'flex items-center p-5 bg-base-300 h-full cursor-text rounded-xl w-full join',
                                replyMessage != undefined && 'rounded-t-none'
                            )}
                        >
                            <span
                                ref={ref}
                                className="text-base-content focus:outline-none empty:before:content-[attr(placeholder)] w-[96%] flex-none join-item"
                                contentEditable={true}
                                role="textarea"
                                onInput={(e) => {
                                    setMessageContent(e.currentTarget.textContent!)
                                }}
                                onKeyDown={(e) => {
                                    if (e.shiftKey && e.key === 'Enter') return

                                    if (e.key === 'Escape') {
                                        if (replyMessage) {
                                            setReplyMessage(undefined)
                                            setPlaceholder('Send Message')
                                        }
                                    }

                                    if (e.key === 'Enter') {
                                        e.preventDefault()

                                        if (replyMessage) {
                                            ReplyMessageContent()

                                            return
                                        }

                                        SendMessageContent()
                                    }
                                }}
                                placeholder={placeholder}
                            ></span>
                            <div className="join-item">
                                <button type="button" className="btn btn-ghost btn-sm" onClick={HandleButtonStates}>
                                    <div className="swap swap-rotate">
                                        <PaperAirplaneIcon className={ClassNames('w-6 h-6', messageContent ? 'swap-off' : 'swap-on')} />
                                        <PaperClipIcon className={ClassNames('w-6 h-6', messageContent ? 'swap-on' : 'swap-off')} />
                                    </div>
                                </button>
                                <input
                                    className="hidden"
                                    type="file"
                                    ref={inputRef}
                                    id="sendbird-attach-file"
                                    multiple={false}
                                    max={1}
                                    accept="image/*"
                                    onChange={() => {
                                        const file = document.querySelector<HTMLInputElement>('#sendbird-attach-file')?.files![0]

                                        if (file) {
                                            if (replyMessage) {
                                                sendFileMessage({
                                                    file: file,
                                                    isReplyToChannel: true,
                                                    parentMessageId: replyMessage.messageId
                                                })
                                                setReplyMessage(undefined)
                                                setPlaceholder('Send Message')

                                                return
                                            }

                                            sendFileMessage({
                                                file: file
                                            })
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
                renderMessage={({ message, chainTop, chainBottom, hasSeparator }) => (
                    <ChatBubble
                        message={{
                            username: message.sender.nickname,
                            profile_photo: message.sender.profileUrl,
                            message: message.isUserMessage() ? (message as UserMessage).message : '',
                            signed_url: message.isFileMessage() ? (message as FileMessage).url : '',
                            sent_timestamp: new Date(message.createdAt),
                            status: ConvertSendbirdToNemuStatus((message as UserMessage).sendingStatus, message),
                            message_type: ConvertSendbirdToNemuMessageType(message.messageType)
                        }}
                        handle_context_menu={(e) => HandleContextMenu(e, message)}
                        current_user={message.sender.userId == session?.user.user_id}
                        chain_top={chainTop}
                        chain_bottom={chainBottom}
                        editing={message.messageId == editingId}
                        has_been_edited={message.updatedAt != 0}
                        has_separator={hasSeparator}
                        parent_message={message.parentMessage || undefined}
                        parent_type={ConvertSendbirdToNemuMessageType(message.parentMessage ? message.parentMessage.messageType : undefined)}
                    />
                )}
            />
            <Transition
                enter="transition-all duration-150 absolute right-0 top-0 h-full"
                enterFrom="opacity-0 z-20 translate-x-20"
                enterTo="opacity-100"
                leave="transition-all duration-150 absolute right-0 top-0 h-full"
                leaveFrom="opacity-100 z-20"
                leaveTo="opacity-0 translate-x-20"
                show={showDetail}
            >
                <div className="w-[21rem] p-5 bg-base-200/80 backdrop-blur-xl absolute right-0 top-0 z-20 h-full rounded-r-xl">
                    <ChannelSettings channel_url={currentChannel?.url!} on_close={() => setShowDetail(false)} />
                </div>
                <div
                    className="w-full h-full absolute top-0 left-0"
                    onClick={() => {
                        setShowDetail(false)
                    }}
                ></div>
            </Transition>
            <Transition
                enter="transition-all duration-200"
                enterFrom="opacity-0 z-30"
                enterTo="opacity-100"
                leave="transition-all duration-200"
                leaveFrom="opacity-100 z-30"
                leaveTo="opacity-0"
                show={contextMenu.show}
            >
                <MessagesContextMenu x={contextMenu.x} y={contextMenu.y} close_context_menu={() => setContextMenu(initialContextMenu)} />
            </Transition>
            <MessagesModal
                showModal={showDeletingModal}
                closeFunction={() => {
                    setShowDeletingModal(false)
                    setDeletingMessage(undefined)
                }}
            >
                <h2 className="card-title">Are you sure?</h2>
                <div className="card-actions justify-end">
                    <button
                        className="btn btn-outline"
                        onClick={() => {
                            setShowDeletingModal(false)
                            setDeletingMessage(undefined)
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-error"
                        onClick={() => {
                            if (deletingMessage) {
                                if (deletingMessage.isUserMessage()) {
                                    deleteMessage(deletingMessage as UserMessage)
                                } else if (deletingMessage.isFileMessage()) {
                                    deleteMessage(deletingMessage as FileMessage)
                                }

                                setDeletingMessage(undefined)
                            }
                        }}
                    >
                        Delete
                    </button>
                </div>
            </MessagesModal>
            <MessagesModal
                showModal={showKanbanModal}
                closeFunction={() => {
                    setShowKanbanModal(false)
                    setMessageToAddToKanban(undefined)
                }}
            >
                <h2 className="card-title">Add to Kanban</h2>
                <div className="divider"></div>
                <ul className="menu gap-2">
                    {kanbanContainers?.map((container) => (
                        <li>
                            <button
                                type="button"
                                onClick={() => {
                                    if (messageToAddToKanban?.isUserMessage()) {
                                        // Update the kanban board
                                        const new_task: KanbanTask = {
                                            id: crypto.randomUUID(),
                                            container_id: container.id,
                                            content: messageToAddToKanban.message
                                        }

                                        fetch(`/api/kanban/${kanbanId}/add`, { method: 'post', body: JSON.stringify({ new_task: new_task }) }).then(
                                            (response: NemuResponse) => {
                                                // Alert the user that stuff happened
                                                if (response.status != StatusCode.InternalError) {
                                                    toast(`Added to "${container.title}" container`, { theme: 'dark', type: 'info' })
                                                } else {
                                                    toast(`Failed to add "${container.title}" container`, { theme: 'dark', type: 'error' })
                                                }

                                                setShowKanbanModal(false)
                                                setMessageToAddToKanban(undefined)
                                            }
                                        )
                                    }
                                }}
                            >
                                {container.title}
                            </button>
                        </li>
                    ))}
                </ul>
            </MessagesModal>
        </div>
    )
}

export default function Channel({ channel_url }: { channel_url: string }) {
    return (
        <GroupChannelProvider channelUrl={channel_url}>
            <CustomChannel />
        </GroupChannelProvider>
    )
}
