import { currentUser } from '@clerk/nextjs/server'

import { Suspense } from 'react'
import NotificationPopover from '~/components/navbar/notifications/notification-popover'

export default function NotificationCenter() {
    return (
        <Suspense fallback={<div className="skeleton h-10 w-10"></div>}>
            <NotificationContent />
        </Suspense>
    )
}

async function NotificationContent() {
    const user = await currentUser()

    if (!user) {
        return null
    }

    return <NotificationPopover user_id={user.id} />
}
