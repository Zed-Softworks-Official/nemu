import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import type { RequestContent } from '~/core/structures'
import DataTable from '~/components/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import { get_request_details } from '~/server/db/query'

export default function RequestDetailsPage({ params }: { params: { order_id: string } }) {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent order_id={params.order_id} />
        </Suspense>
    )
}

async function PageContent(props: { order_id: string }) {
    const request = await get_request_details(props.order_id)

    if (!request || !request.commission) {
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
    const request_details = request.content as RequestContent

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <CardTitle>{request.commission.title}</CardTitle>
                    <CardDescription>
                        By{' '}
                        <Link
                            href={`/@${request.commission.artist?.handle}`}
                            className="link-hover link"
                        >
                            @{request.commission.artist?.handle}
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
