import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import MessagesClient from '~/components/messages/messages'
import Loading from '~/components/ui/loading'

export default async function RequestMessagesPage(props: {
    params: Promise<{ order_id: string }>
}) {
    const params = await props.params

    return (
        <Suspense fallback={<Loading />}>
            <DisplayClient order_id={params.order_id} />
        </Suspense>
    )
}

async function DisplayClient(props: { order_id: string }) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    return <MessagesClient hide={true} channel_url={props.order_id} user_id={user.id} />
}
