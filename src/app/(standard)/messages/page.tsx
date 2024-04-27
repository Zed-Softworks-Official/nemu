import { redirect } from 'next/navigation'

import MessagesClient from '~/components/messages/messages'
import { getServerAuthSession } from '~/server/auth'

export default async function MessagesPage() {
    const session = await getServerAuthSession()

    if (!session) {
        return redirect('/u/login')
    }

    return <MessagesClient session={session} />
}
