'use client'

import Loading from '~/components/ui/loading'
import NemuImage from '~/components/nemu-image'
import { api } from '~/trpc/react'

import { type ClientRequestData } from '~/lib/structures'
import { Button } from '~/components/ui/button'
import Link from 'next/link'
import { DataTable } from '~/components/data-table'
import { type BadgeProps } from '~/components/ui/badge'
import { Badge } from '~/components/ui/badge'
import { Eye } from 'lucide-react'

export function RequestTable() {
    const { data: requests, isLoading } = api.request.getRequestList.useQuery()

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

    return (
        <DataTable
            columnDefs={[
                {
                    headerName: 'Image',
                    field: 'commission.images',
                    cellRenderer: ({ data }: { data: ClientRequestData }) => {
                        const commission = data.commission
                        const image = commission?.images[0]

                        return (
                            <NemuImage
                                src={image?.url ?? '/nemu/not-like-this.png'}
                                alt="Image"
                                width={100}
                                height={100}
                                className="overflow-hidden bg-cover"
                            />
                        )
                    }
                },
                {
                    headerName: 'Title',
                    field: 'commission.title',
                    filter: true,
                    wrapText: true
                },
                {
                    headerName: 'Artist',
                    field: 'commission.artist.handle',
                    width: 200
                },
                {
                    headerName: 'Status',
                    field: 'status',
                    cellRenderer: ({ data }: { data: ClientRequestData }) => {
                        const status = data.status

                        let variant: BadgeProps['variant'] = 'default'
                        switch (status) {
                            case 'accepted':
                                variant = 'default'
                                break
                            case 'pending':
                                variant = 'outline'
                                break
                            case 'rejected':
                                variant = 'destructive'
                                break
                            case 'waitlist':
                                variant = 'warning'
                                break
                            case 'cancelled':
                                variant = 'destructive'
                                break
                        }

                        return <Badge variant={variant}>{status}</Badge>
                    }
                },
                {
                    headerName: 'Actions',
                    flex: 1,
                    field: 'commission',
                    cellRenderer: ({ data }: { data: ClientRequestData }) => {
                        if (data.status === 'rejected' || data.status === 'pending') {
                            return null
                        }

                        return (
                            <div className="flex h-full w-full items-center justify-start">
                                <Button variant={'outline'} asChild>
                                    <Link href={`/requests/${data.order_id}/details`}>
                                        <Eye className="size-4" />
                                        View
                                    </Link>
                                </Button>
                            </div>
                        )
                    }
                }
            ]}
            rowData={requests}
            rowHeight={100}
        />
    )
}
