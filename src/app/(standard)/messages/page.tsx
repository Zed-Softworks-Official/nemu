import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import MessagesClient from '~/components/messages/messages'
import Loading from '~/components/ui/loading'

export default function MessagesPage() {
    return (
        <Suspense fallback={<Loading />}>
            <DisplayClient />
        </Suspense>
    )
}

async function DisplayClient() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    return <MessagesClient user_id={user.id} />
}
