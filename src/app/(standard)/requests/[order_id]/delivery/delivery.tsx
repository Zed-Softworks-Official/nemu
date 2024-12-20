'use client'

import NemuImage from '~/components/nemu-image'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'

export default function Delivery(props: { order_id: string }) {
    const { data: request, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: props.order_id
    })

    if (isLoading) {
        return <Loading />
    }

    if (!request?.delivery) {
        return (
            <Card>
                <CardHeader className="flex h-full w-full items-center justify-center">
                    <NemuImage
                        src={'/nemu/sad.png'}
                        alt="Not Like This"
                        width={200}
                        height={200}
                    />
                    <CardTitle>No Downloads Yet!</CardTitle>
                </CardHeader>
            </Card>
        )
    }

    return (
        <main className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <CardTitle>Downloads</CardTitle>
                </CardHeader>
                <CardContent>{JSON.stringify(request.delivery)}</CardContent>
            </Card>
        </main>
    )
}
