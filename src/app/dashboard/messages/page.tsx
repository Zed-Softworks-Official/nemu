import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import MessagesClient from '~/components/messages/messages'

export default async function DashboardMessagesPage() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    return <MessagesClient />
}
