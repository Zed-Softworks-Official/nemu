'use client'

import MessagesCard from "./messages-card"

export default function MessageSidebar() {
    return (
        <div className="w-[25rem] bg-base-200 join-item p-5 flex flex-col gap-5">
            <MessagesCard
                message_preview={{
                    other_username: 'GnarlyTiger',
                    last_message: `That's not ChibiMiharu! That's me!`,
                    last_message_current_user: true
                }}
                selected
            />
            <MessagesCard
                message_preview={{
                    other_username: 'ChibiMiharu',
                    last_message: `Could you add more pink?`,
                    last_message_current_user: false
                }}
            />
            <MessagesCard
                message_preview={{
                    other_username: 'Some Random Guy',
                    last_message: `This won't happen because of something that i don't know man you tell me`,
                    last_message_current_user: false
                }}
            />
        </div>
    )
}
