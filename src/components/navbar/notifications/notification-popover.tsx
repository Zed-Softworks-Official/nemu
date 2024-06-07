'use client'

import {
    NotificationBell,
    NovuProvider,
    PopoverNotificationCenter
} from '@novu/notification-center'

export default function NotificationPopover(props: { user_id: string }) {
    return (
        <NovuProvider subscriberId={props.user_id} applicationIdentifier="46rLkwFYDdb-">
            <PopoverNotificationCenter colorScheme="dark">
                {({ unseenCount }) => <NotificationBell unseenCount={unseenCount} />}
            </PopoverNotificationCenter>
        </NovuProvider>
    )
}
