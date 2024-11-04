import { Suspense } from 'react'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import MessagesClient from '~/components/messages/messages'
import Loading from '~/components/ui/loading'

export default function DashboardMessagesPage() {
    return (
        <Suspense fallback={<Loading />}>
            <MessagesContent />
        </Suspense>
    )
}

async function MessagesContent() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    return <MessagesClient user_id={user.id} />
}
