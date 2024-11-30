'use client'

import { Skeleton } from '~/components/ui/skeleton'
import { api } from '~/trpc/react'

export function CommissionHeader(props: { order_id: string }) {
    const { data: request, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: props.order_id
    })

    if (isLoading) {
        return <Skeleton className="h-10 w-full" />
    }

    return (
        <div className="flex flex-col gap-5">
            <h1 className="text-2xl font-bold">{request?.commission?.title}</h1>
            <span className="text-sm text-muted-foreground">
                {request?.created_at?.toLocaleDateString()}
            </span>
        </div>
    )
}
