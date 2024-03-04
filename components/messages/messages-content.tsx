'use client'
import { Bars3Icon } from '@heroicons/react/20/solid'
import ChatBubble from './chat-buble'
import { ChatMessageType, ChatStatus } from '@/core/structures'
import MessageTextInput from './message-text-input'
import { useSession } from 'next-auth/react'
import { Transition } from '@headlessui/react'
import { useState } from 'react'
import NemuImage from '../nemu-image'

export default function MessagesContent() {
    const { data: session } = useSession()
    const [showDetail, setShowDetail] = useState(false)

    return (
        <>
            <div className="bg-base-100 h-[60rem] join-item relative w-full">
                <div className="flex w-full justify-between items-center bg-base-300/80 backdrop-blur-2xl p-5 absolute z-10 rounded-tr-xl">
                    <h2 className="card-title">GnarlyTiger</h2>
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
                <div className="h-full">
                    <div className="flex flex-col p-5 w-full justify-end h-[95%] overflow-y-scroll">
                        <ChatBubble
                            message={{
                                username: 'GnarlyTiger',
                                profile_photo: '',
                                message_type: ChatMessageType.Text,
                                message: `I'd like a vtuber kid of like ChibiMiharu`,
                                sent_timestamp: new Date(),
                                status: ChatStatus.Delivered
                            }}
                        />
                        <ChatBubble
                            message={{
                                username: 'Nemu',
                                profile_photo: '',
                                message_type: ChatMessageType.Text,
                                message: 'Could you send a reference?',
                                sent_timestamp: new Date(),
                                status: ChatStatus.Delivered
                            }}
                            current_user
                        />
                        <ChatBubble
                            message={{
                                username: 'GnarlyTiger',
                                profile_photo: '',
                                message_type: ChatMessageType.Image,
                                signed_url: '/loading.gif',
                                sent_timestamp: new Date(),
                                status: ChatStatus.Delivered
                            }}
                        />
                        <ChatBubble
                            message={{
                                username: 'Nemu',
                                profile_photo: '',
                                message_type: ChatMessageType.Text,
                                message: `That's not ChibiMiharu! That's Me!`,
                                sent_timestamp: new Date(),
                                seen_timestamp: new Date(),
                                status: ChatStatus.Seen
                            }}
                            current_user
                        />
                    </div>
                    <MessageTextInput other_username="GnarlyTiger" />
                    <Transition
                        enter="transition-all duration-150 absolute right-0 top-0 h-full"
                        enterFrom="opacity-0 z-20 translate-x-20"
                        enterTo="opacity-100"
                        leave="transition-all duration-150 absolute right-0 top-0 h-full"
                        leaveFrom="opacity-100 z-20"
                        leaveTo="opacity-0 translate-x-20"
                        show={showDetail}
                    >
                        <div className="w-80 p-5 bg-base-200/80 backdrop-blur-xl absolute right-0 top-0 z-20 h-full rounded-r-xl">
                            <div className="card bg-base-300">
                                <div className="card-body">
                                    <div className="flex flex-col gap-5 justify-center items-center">
                                        <NemuImage
                                            src={'/profile.png'}
                                            alt="profile picture"
                                            width={200}
                                            height={200}
                                            className="avatar rounded-full w-24 h-24"
                                        />
                                        <h2 className="card-title">GnarlyTiger</h2>
                                        <p>About the user, will container links to their profile and an @ symbol if they're an artist</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div
                            className="w-full h-full absolute top-0 left-0"
                            onClick={() => {
                                setShowDetail(false)
                            }}
                        ></div>
                    </Transition>
                </div>
            </div>
        </>
    )
}
