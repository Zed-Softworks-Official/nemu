'use client'

import ChannelSettingsUI from '@sendbird/uikit-react/ChannelSettings/components/ChannelSettingsUI'
import { ChannelSettingsProvider, useChannelSettingsContext } from '@sendbird/uikit-react/ChannelSettings/context'
import NemuImage from '../nemu-image'
import { useSession } from 'next-auth/react'
import { UsersIcon } from 'lucide-react'

function CustomSettings() {
    const { data: session } = useSession()
    const { channel } = useChannelSettingsContext()

    return (
        <ChannelSettingsUI
            renderChannelProfile={() => (
                <div className="flex flex-col gap-5 w-full justify-center items-center p-5">
                    <NemuImage src={channel?.coverUrl!} alt="cover url" width={100} height={100} className="avatar rounded-full" />
                    <h2 className="card-title">{channel?.name}</h2>
                </div>
            )}
            renderModerationPanel={() => (
                <div className="bg-base-200 rounded-xl">
                    <div className="collapse collapse-arrow bg-base-200">
                        <input type="radio" name="moderation-panel-accordion" />
                        <div className="collapse-title text-xl font-medium">
                            <div className="flex gap-2 items-center">
                                <UsersIcon className="w-6 h-6" />
                                Users
                            </div>
                        </div>
                        <div className="collapse-content">
                            <ul className="menu">
                                {channel?.members.map((member) => (
                                    <li key={member.userId}>
                                        <div className="flex gap-5 items-center">
                                            <NemuImage
                                                src={member.profileUrl}
                                                alt="profile"
                                                width={100}
                                                height={100}
                                                className="w-10 h-10 avatar rounded-full"
                                            />
                                            <p>
                                                {member.nickname}{' '}
                                                {session?.user.id === member.userId && (
                                                    <span className="text-xs text-base-content/60">(You)</span>
                                                )}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
            renderLeaveChannel={() => <></>}
        />
    )
}

export default function ChannelSettings({ channel_url, on_close }: { channel_url: string; on_close: () => void }) {
    return (
        <ChannelSettingsProvider channelUrl={channel_url} onCloseClick={on_close}>
            <CustomSettings />
        </ChannelSettingsProvider>
    )
}
