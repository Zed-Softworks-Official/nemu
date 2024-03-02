'use client'

import { Bars3Icon, XCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import NemuImage from '../nemu-image'

export default function MessagesClient() {
    return (
        <div className="bg-base-100 rounded-xl flex shadow-xl">
            <div className="drawer drawer-end">
                <input id="nemu-messages-details" type="checkbox" className="drawer-toggle" />
                <div className="drawer-content">
                    {/* Page content here */}
                    <div className="flex join">
                        <div className="w-[25rem] bg-base-200 join-item p-5 flex flex-col gap-5">
                            <div className="card bg-primary cursor-pointer shadow-xl">
                                <div className="card-body">
                                    <h2 className="font-bold font-lg">GnarlyTiger</h2>
                                    <p className="font-md">Previous Message</p>
                                </div>
                            </div>
                            <div className="card bg-base-100 hover:bg-primary hover:shadow-xl cursor-pointer">
                                <div className="card-body">
                                    <h2 className="font-bold font-lg">ChibiMiharu</h2>
                                    <p className="font-md">Previous Message</p>
                                </div>
                            </div>
                            <div className="card bg-base-100 hover:bg-primary hover:shadow-xl cursor-pointer">
                                <div className="card-body">
                                    <h2 className="font-bold font-lg">Some random guy</h2>
                                    <p className="font-md">Previous Message</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-base-100 h-[60rem] join-item relative w-full">
                            <div className="flex w-full justify-between items-center bg-base-300/80 backdrop-blur-2xl p-5 absolute z-10 rounded-tr-xl">
                                <h2 className="card-title">GnarlyTiger</h2>
                                <label htmlFor="nemu-messages-details" className="drawer-button btn btn-ghost">
                                    <Bars3Icon className="w-6 h-6" />
                                </label>
                            </div>
                            <div className="h-full">
                                <div className="flex flex-col p-5 w-full justify-end h-[95%] overflow-y-scroll">
                                    <div className="chat chat-start">
                                        <div className="chat-image avatar">
                                            <div className="w-10 rounded-full">
                                                <img alt="profile picture" src="/profile.png" />
                                            </div>
                                        </div>
                                        <div className="chat-header">
                                            GnarlyTiger
                                            <time className="text-xs opacity-50 ml-2">12:45</time>
                                        </div>
                                        <div className="chat-bubble chat-bubble-accent p-4">I'd like a vtuber kind of like ChibiMiharu</div>
                                        <div className="chat-footer opacity-50">Delivered</div>
                                    </div>
                                    <div className="chat chat-end">
                                        <div className="chat-image avatar">
                                            <div className="w-10 rounded-full">
                                                <img alt="profile picture" src="/profile.png" />
                                            </div>
                                        </div>
                                        <div className="chat-header">
                                            Nemu
                                            <time className="text-xs opacity-50 ml-2">12:46</time>
                                        </div>
                                        <div className="chat-bubble text-base-content p-4">Could you send a reference?</div>
                                        <div className="chat-footer opacity-50">Delivered</div>
                                    </div>
                                    <div className="chat chat-start">
                                        <div className="chat-image avatar">
                                            <div className="w-10 rounded-full">
                                                <img alt="profile picture" src="/profile.png" />
                                            </div>
                                        </div>
                                        <div className="chat-header">
                                            GnarlyTiger
                                            <time className="text-xs opacity-50 ml-2">12:45</time>
                                        </div>
                                        <div className="chat-bubble chat-bubble-accent p-4">
                                            <NemuImage src={'/loading.gif'} alt="user image" width={200} height={200} />
                                        </div>
                                        <div className="chat-footer opacity-50">Delivered</div>
                                    </div>
                                    <div className="chat chat-end">
                                        <div className="chat-image avatar">
                                            <div className="w-10 rounded-full">
                                                <img alt="profile picture" src="/profile.png" />
                                            </div>
                                        </div>
                                        <div className="chat-header">
                                            Nemu
                                            <time className="text-xs opacity-50 ml-2">12:46</time>
                                        </div>
                                        <div className="chat-bubble text-base-content p-4">That's not ChibiMiharu, That's Me!</div>
                                        <div className="chat-footer opacity-50">Seen at 12:46</div>
                                    </div>
                                </div>
                                <div className="absolute bottom-0 w-full">
                                    <input type="text" className="input input-lg bg-base-300 rounded-t-none rounded-bl-none w-full" placeholder="Message GnarlyTiger" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="drawer-side z-20">
                    <label htmlFor="nemu-messages-details" aria-label="close sidebar" className="drawer-overlay"></label>
                    <ul className="menu p-4 w-80 min-h-full bg-base-200 text-base-content">
                        {/* Sidebar content here */}
                        <div className="flex flex-col gap-5 justify-center items-center bg-base-300 rounded-xl p-5">
                            <NemuImage className="avatar rounded-full" src={'/profile.png'} alt="profile picture" width={100} height={100} />
                            <h2 className="card-title">GnarlyTiger</h2>
                            <p>User card depends on who your messaging, if it's an artist will use @ symbol along with handle instead of username</p>
                        </div>
                        <div className="divider"></div>
                        <li>
                            <a>Sidebar Item 2</a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
