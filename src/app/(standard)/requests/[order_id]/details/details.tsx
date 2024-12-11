'use client'

import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { api } from '~/trpc/react'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { DataTable } from '~/components/data-table'
import Loading from '~/components/ui/loading'

import type { RequestContent } from '~/lib/structures'
import { type ColumnDef } from '@tanstack/react-table'

export default function Details() {
    const params = useParams()

    const { data: request, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: params.order_id as string
    })

    if (isLoading) {
        return <Loading />
    }

    if (!request) {
        return notFound()
    }

    const request_columns: ColumnDef<{
        item_label: string
        item_value: string
    }>[] = [
        {
            accessorKey: 'item_label',
            header: 'Form Item'
        },
        {
            accessorKey: 'item_value',
            header: 'Response'
        }
    ]
    const request_details = request.content as unknown as RequestContent

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <CardTitle>{request.commission?.title}</CardTitle>
                    <CardDescription>
                        By{' '}
                        <Link
                            href={`/@${request.commission?.artist?.handle}`}
                            className="link-hover link"
                        >
                            @{request.commission?.artist?.handle}
                        </Link>
                    </CardDescription>
                </CardHeader>
                <div className="divider"></div>
                <CardContent>
                    <div className="flex flex-col gap-5">
                        <DataTable
                            columns={request_columns}
                            data={Object.keys(request_details).map((key) => ({
                                item_label: request_details[key]!.label,
                                item_value: request_details[key]!.value
                            }))}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
