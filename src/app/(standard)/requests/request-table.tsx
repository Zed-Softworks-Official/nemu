'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RequestStatus } from '~/core/structures'
import Link from 'next/link'
import { DataTable } from '~/components/data-table'
import NemuImage from '~/components/nemu-image'
import type { ClientRequestData } from '~/core/structures'
import { EyeIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'

export default function RequestTable({ requests }: { requests: ClientRequestData[] }) {
    const columns: ColumnDef<ClientRequestData>[] = [
        {
            id: 'image',
            header: 'Featured Image',
            cell: ({ row }) => {
                const commission = row.original.commission
                const image = commission?.images[0]

                return (
                    <NemuImage
                        src={image?.url ?? '/nemu/not-like-this.png'}
                        alt="Featured Image"
                        width={100}
                        height={100}
                        className="rounded-lg"
                    />
                )
            }
        },
        {
            accessorKey: 'commission.title',
            header: 'Title'
        },
        {
            accessorKey: 'commission.artist.handle',
            header: 'Artist',
            cell: ({ row }) => {
                const handle: string =
                    row.original.commission?.artist?.handle ?? 'Unknown'

                return (
                    <Button variant="link" asChild>
                        <Link href={`/@${handle}`}>@{handle}</Link>
                    </Button>
                )
            }
        },
        {
            accessorKey: 'status',
            header: 'Status'
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const status = row.getValue('status')
                const order_id = row.original.order_id

                if (
                    status === RequestStatus.Accepted ||
                    status === RequestStatus.Delivered
                ) {
                    return (
                        <Button variant="outline" asChild>
                            <Link href={`/requests/${order_id}/details`}>
                                <EyeIcon className="h-4 w-4" /> View
                            </Link>
                        </Button>
                    )
                }
                return null
            }
        }
    ]

    return (
        <main className="flex h-full w-full flex-col p-6">
            <DataTable columns={columns} data={requests} />
        </main>
    )
}
