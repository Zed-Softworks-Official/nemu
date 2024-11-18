'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RequestStatus } from '~/core/structures'
import Link from 'next/link'
import { DataTable } from '~/components/data-table'
import NemuImage from '~/components/nemu-image'
import type { ClientRequestData } from '~/core/structures'
import { EyeIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'
import Loading from '~/components/ui/loading'

export default function RequestTable() {
    const { data: requests, isLoading } = api.request.get_request_list.useQuery()

    if (isLoading) {
        return <Loading />
    }

    if (!requests || requests.length === 0) {
        return (
            <main className="flex h-full w-full flex-col p-6">
                <div className="flex flex-col items-center justify-center gap-5">
                    <NemuImage src={'/nemu/sad.png'} alt="Sad" width={200} height={200} />
                    <h2 className="text-2xl font-bold">No Requests</h2>
                    <p className="text-base-content/60">You have no requests yet!</p>
                </div>
            </main>
        )
    }

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
