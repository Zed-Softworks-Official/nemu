import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { MessagesClient } from '~/components/messages/messages-client'
import Loading from '~/components/ui/loading'

export default async function MessagesPage(props: {
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

    return <MessagesClient list_hidden={true} current_order_id={props.order_id} />
}
