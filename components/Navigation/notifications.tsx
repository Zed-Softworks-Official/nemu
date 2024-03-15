'use client'

import { NovuProvider, PopoverNotificationCenter, NotificationBell } from '@novu/notification-center'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

export default function Notifications() {
    const { data: session } = useSession()
    const [subscriberId, setSubscriberId] = useState<string | undefined>(undefined)

    useEffect(() => {
        if (!session) return

        setSubscriberId(session.user.user_id)
    }, [session])

    if (!subscriberId) {
        return <></>
    }

    return (
        <NovuProvider subscriberId={subscriberId} applicationIdentifier="E99zFNlbi0Fe">
            <PopoverNotificationCenter colorScheme="dark">
                {({ unseenCount }) => <NotificationBell unseenCount={unseenCount} />}
            </PopoverNotificationCenter>
        </NovuProvider>
    )
}
