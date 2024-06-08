import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import MessagesClient from '~/components/messages/messages'
import Loading from '~/components/ui/loading'

export default async function DashboardMessagesPage() {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent />
        </Suspense>
    )
}

async function PageContent() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    return <MessagesClient />
}
