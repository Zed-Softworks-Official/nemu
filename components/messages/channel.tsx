'use client'
import { Bars3Icon, ChatBubbleOvalLeftEllipsisIcon, PaperAirplaneIcon, PaperClipIcon } from '@heroicons/react/20/solid'
import ChatBubble from './chat-buble'
import { ChatMessageType, ChatStatus } from '@/core/structures'
import MessageTextInput from './message-text-input'
import { useSession } from 'next-auth/react'
import { Transition } from '@headlessui/react'
import { useState } from 'react'
import NemuImage from '../nemu-image'

import { GroupChannelUI } from '@sendbird/uikit-react/GroupChannel/components/GroupChannelUI'
import { GroupChannelProvider, useGroupChannelContext } from '@sendbird/uikit-react/GroupChannel/context'
import { FileMessage, MessageType, SendingStatus, UserMessage } from '@sendbird/chat/message'

import Loading from '../loading'
import ChannelSettings from './channel-settings'

function CustomChannel() {
    const { currentChannel, sendUserMessage, sendFileMessage } = useGroupChannelContext()
    const { data: session } = useSession()

    const [showDetail, setShowDetail] = useState(false)

    function ConvertSendbirdToNemuMessageType(message_type: MessageType) {
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

    function ConvertSendbirdToNemuStatus(status: SendingStatus) {
        switch (status) {
            case SendingStatus.SUCCEEDED:
                return ChatStatus.Delivered
            case SendingStatus.FAILED:
                return ChatStatus.Failed
        }

        return ChatStatus.Failed
    }

    return (
        <div className="relative w-full">
            <GroupChannelUI
                renderPlaceholderInvalid={() => (
                    <div className="flex flex-col w-full h-full bg-base-100 justify-center items-center gap-5">
                        <NemuImage src="/nemu/sad.png" alt="Sad nemu" width={200} height={200} />
                        <h2 className="card-title">There's no channel selected</h2>
                    </div>
                )}
                renderPlaceholderEmpty={() => (
                    <div className='flex flex-col w-full h-full bg-base-100 justify-center items-center gap-5 text-base-content/80'>
                        <ChatBubbleOvalLeftEllipsisIcon className='w-20 h-20' />
                        <h2 className='card-title'>No Messages</h2>
                    </div>
                )}
                renderPlaceholderLoader={() => (
                    <div className='flex flex-col w-full h-full bg-base-100 justify-center items-center'>
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
                // renderFileUploadIcon={() => (
                //     <button type="button" className="absolute right-3 top-1 btn btn-ghost" onClick={async () => {
                //         // await sendFileMessage({})
                //     }}>
                //         <PaperClipIcon className="w-6 h-6" />
                //     </button>
                // )}
                // renderSendMessageIcon={() => (
                //     <button type="button" className="absolute -top-1 right-0 btn btn-ghost" onClick={async () => {
                //         await sendUserMessage({
                //             message: 'Hello, World!'
                //         })
                //     }}>
                //         <PaperAirplaneIcon className="w-6 h-6" />
                //     </button>
                // )}
                // renderMessageInput={() => (
                //     <div className="flex p-5 bg-base-300 h-16 relative" contentEditable={true} role="textbox" aria-label="Text Input">
                //         <span className="text-base-content/80">Send Message</span>
                //         <div className="absolute top-0 right-0">
                //             <button type="button" className="btn btn-ghost">
                //                 <PaperClipIcon className="w-6 h-6" />
                //             </button>
                //         </div>
                //     </div>
                // )}
                renderMessage={({message}) => {
                    return (
                        <ChatBubble
                            message={{
                                username: message.sender.nickname,
                                profile_photo: message.sender.profileUrl,
                                message: message.isUserMessage() ? (message as UserMessage).message : '',
                                signed_url: message.isFileMessage() ? (message as FileMessage).url : '',
                                sent_timestamp: new Date(message.createdAt),
                                status: ConvertSendbirdToNemuStatus((message as UserMessage).sendingStatus),
                                message_type: ConvertSendbirdToNemuMessageType(message.messageType)
                            }}
                            current_user={message.sender.userId == session?.user.user_id}
                        />
                    )
                }}
                renderCustomSeparator={({message}) => <div className="p-5 bg-primary w-full h-20">{message.createdAt}</div>}
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
                    <ChannelSettings channel_url={currentChannel?.url!} />
                </div>
                <div
                    className="w-full h-full absolute top-0 left-0"
                    onClick={() => {
                        setShowDetail(false)
                    }}
                ></div>
            </Transition>
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
