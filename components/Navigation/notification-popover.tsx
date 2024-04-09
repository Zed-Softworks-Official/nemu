'use client'

import {
    NovuProvider,
    PopoverNotificationCenter,
    NotificationBell,
    INotificationCenterStyles,
    IMessage
} from '@novu/notification-center'
import { Session } from 'next-auth'
import { redirect } from 'next/navigation'

export default function NotificationPopover({
    session,
    styles
}: {
    session: Session
    styles: INotificationCenterStyles
}) {
    function HandleOnNotificationOnClick(message: IMessage) {
        if (message?.cta?.data?.url) {
            redirect(message.cta.data.url!)
        }
    }

    return (
        <NovuProvider
            subscriberId={session.user.id}
            applicationIdentifier="E99zFNlbi0Fe"
            styles={styles}
        >
            <PopoverNotificationCenter
                colorScheme="dark"
                showUserPreferences={false}
                onNotificationClick={HandleOnNotificationOnClick}
                footer={() => <></>}
            >
                {({ unseenCount }) => (
                    <NotificationBell
                        unseenCount={unseenCount}
                        unseenBadgeColor={'#2185d5'}
                    />
                )}
            </PopoverNotificationCenter>
        </NovuProvider>
    )
}
