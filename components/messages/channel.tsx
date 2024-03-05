'use client'
import { Bars3Icon } from '@heroicons/react/20/solid'
import ChatBubble from './chat-buble'
import { ChatMessageType, ChatStatus } from '@/core/structures'
import MessageTextInput from './message-text-input'
import { useSession } from 'next-auth/react'
import { Transition } from '@headlessui/react'
import { useState } from 'react'
import NemuImage from '../nemu-image'

import { GroupChannelUI } from '@sendbird/uikit-react/GroupChannel/components/GroupChannelUI'
import {
    GroupChannelProviderProps,
    GroupChannelProvider,
    useGroupChannelContext,
    GroupChannelContextType
} from '@sendbird/uikit-react/GroupChannel/context'
import { BaseMessage, FileMessage, MessageType, SendingStatus, UserMessage } from '@sendbird/chat/message'

export function CustomChannel() {
    const { currentChannel } = useGroupChannelContext()
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
            case SendingStatus.SUCCEEDED: return ChatStatus.Delivered
            case SendingStatus.FAILED: return ChatStatus.Failed
        }

        return ChatStatus.Failed
    }

    return (
        <GroupChannelUI
            renderPlaceholderInvalid={() => (
                <div className="flex flex-col w-full h-full bg-base-100 justify-center items-center gap-5">
                    <NemuImage src="/nemu/sad.png" alt="Sad nemu" width={200} height={200} />
                    <h2 className="card-title">There's no channel selected</h2>
                </div>
            )}
            renderChannelHeader={() => (
                <div className="flex w-full p-5 justify-between items-center bg-base-200">
                    <h2 className="card-title">{currentChannel?.name}</h2>
                    <button type="button" className="btn btn-ghost">
                        <Bars3Icon className="w-6 h-6" />
                    </button>
                </div>
            )}
            renderMessage={(props) => (
                <ChatBubble
                    message={{
                        username: props.message.sender.nickname,
                        profile_photo: props.message.sender.profileUrl,
                        message: props.message.isUserMessage() ? (props.message as UserMessage).message : '',
                        signed_url: props.message.isFileMessage() ? (props.message as FileMessage).url : '',
                        sent_timestamp: new Date(props.message.createdAt),
                        status: ConvertSendbirdToNemuStatus((props.message as UserMessage).sendingStatus),
                        message_type: ConvertSendbirdToNemuMessageType(props.message.messageType)
                    }}
                    current_user={props.message.sender.userId == session?.user.user_id}
                />
            )}
            renderCustomSeparator={(props) => (
                <div className='divider'>{props.message.createdAt}</div>
            )}
        />
        // <div className="bg-base-100 h-[60rem] join-item relative w-full">
        //     <div className="flex w-full justify-between items-center bg-base-300/80 backdrop-blur-2xl p-5 absolute z-10 rounded-tr-xl">
        //         <h2 className="card-title">{currentChannel ? currentChannel.name : 'No Channel Selected'}</h2>
        //         <button
        //             type="button"
        //             className="btn btn-ghost"
        //             onClick={() => {
        //                 setShowDetail(true)
        //             }}
        //         >
        //             <Bars3Icon className="w-6 h-6" />
        //         </button>
        //     </div>
        //     <div className="h-full w-full">
        //         <div className="flex flex-col w-full h-full overflow-y-scroll">

        //         </div>
        //         <Transition
        //             enter="transition-all duration-150 absolute right-0 top-0 h-full"
        //             enterFrom="opacity-0 z-20 translate-x-20"
        //             enterTo="opacity-100"
        //             leave="transition-all duration-150 absolute right-0 top-0 h-full"
        //             leaveFrom="opacity-100 z-20"
        //             leaveTo="opacity-0 translate-x-20"
        //             show={showDetail}
        //         >
        //             <div className="w-80 p-5 bg-base-200/80 backdrop-blur-xl absolute right-0 top-0 z-20 h-full rounded-r-xl">
        //                 <div className="card bg-base-300">
        //                     <div className="card-body">
        //                         <div className="flex flex-col gap-5 justify-center items-center">
        //                             <NemuImage
        //                                 src={'/profile.png'}
        //                                 alt="profile picture"
        //                                 width={200}
        //                                 height={200}
        //                                 className="avatar rounded-full w-24 h-24"
        //                             />
        //                             <h2 className="card-title">GnarlyTiger</h2>
        //                             <p>About the user, will container links to their profile and an @ symbol if they're an artist</p>
        //                         </div>
        //                     </div>
        //                 </div>
        //             </div>
        //             <div
        //                 className="w-full h-full absolute top-0 left-0"
        //                 onClick={() => {
        //                     setShowDetail(false)
        //                 }}
        //             ></div>
        //         </Transition>
        //     </div>
        // </div>
    )
}

export default function Channel({ channel_url }: { channel_url: string }) {
    return (
        <GroupChannelProvider channelUrl={channel_url}>
            <CustomChannel />
        </GroupChannelProvider>
    )
}
