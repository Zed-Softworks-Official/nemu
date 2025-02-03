'use client'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { DataTable } from '~/components/data-table'

import { Separator } from '~/components/ui/separator'
import { useOrder } from '~/components/orders/standard-order'

export default function Details() {
    const { request_data } = useOrder()

    if (!request_data) {
        return notFound()
    }

    const request_details = request_data.content as unknown as Record<string, string>

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <CardTitle>{request_data.commission?.title}</CardTitle>
                    <CardDescription>
                        By{' '}
                        <Link
                            href={`/@${request_data.commission?.artist?.handle}`}
                            className="link-hover link"
                        >
                            @{request_data.commission?.artist?.handle}
                        </Link>
                    </CardDescription>
                </CardHeader>
                <Separator />
                <CardContent>
                    <div className="mt-5">
                        <DataTable
                            columnDefs={[
                                {
                                    field: 'item_label',
                                    headerName: 'Form Item'
                                },
                                {
                                    field: 'item_value',
                                    headerName: 'Response',
                                    flex: 1
                                }
                            ]}
                            rowData={Object.keys(request_details).map((key) => ({
                                item_label: key,
                                item_value: request_details[key] ?? 'N/A'
                            }))}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
