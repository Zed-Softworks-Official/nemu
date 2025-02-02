'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { Eye, EyeOff, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '~/components/data-table'

import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { RequestStatus, type ClientRequestData } from '~/lib/structures'
import { api } from '~/trpc/react'

export function PublishButton(props: { id: string; published: boolean }) {
    const [currentlyPublished, setCurrentlyPublished] = useState(props.published)
    const publishCommission = api.commission.update_commission.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Updating Commission')
            return { toast_id }
        },
        onSuccess: (_, __, { toast_id }) => {
            toast.success('Commission Updated', {
                id: toast_id
            })
        },
        onError: (_, __, context) => {
            if (!context?.toast_id) return

            toast.error('Failed to Update Commission', {
                id: context.toast_id
            })
        }
    })

    return (
        <Button
            variant={currentlyPublished ? 'destructive' : 'default'}
            onClick={() => {
                const new_state = !currentlyPublished
                setCurrentlyPublished(new_state)

                publishCommission.mutate({
                    id: props.id,
                    data: {
                        published: new_state
                    }
                })
            }}
            disabled={publishCommission.isPending}
        >
            {currentlyPublished ? (
                <>
                    <EyeOff className="h-6 w-6" /> Unpublish
                </>
            ) : (
                <>
                    <Eye className="h-6 w-6" /> Publish
                </>
            )}
        </Button>
    )
}

export function RequestList(props: { requests: ClientRequestData[]; slug: string }) {
    const [requests, setRequests] = useState(props.requests)

    const columns: ColumnDef<ClientRequestData>[] = [
        {
            header: 'Username',
            accessorKey: 'user.username'
        },
        {
            header: 'Date',
            accessorFn: (row) => new Date(row.created_at).toLocaleDateString()
        },
        {
            header: 'Status',
            accessorKey: 'status'
        },
        {
            id: 'actions',
            cell: (data) => {
                const request = data.row.original

                if (
                    request.status !== RequestStatus.Accepted &&
                    request.status !== RequestStatus.Pending
                ) {
                    return null
                }

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'ghost'}>
                                <MoreHorizontal className="h-6 w-6" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem asChild>
                                <Link
                                    href={`/dashboard/commissions/${props.slug}/${request.order_id}`}
                                >
                                    View Request
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        }
    ]

    return (
        <div className="mt-5">
            <div className="mb-5 flex items-center gap-2">
                <Button variant={'outline'} onClick={() => setRequests(props.requests)}>
                    Show All
                </Button>
                <Button
                    variant={'outline'}
                    onClick={() =>
                        setRequests(
                            props.requests?.filter(
                                (request) => request.status === RequestStatus.Accepted
                            )
                        )
                    }
                >
                    Accepted
                </Button>
                <Button
                    variant={'outline'}
                    onClick={() =>
                        setRequests(
                            props.requests?.filter(
                                (request) => request.status === RequestStatus.Pending
                            )
                        )
                    }
                >
                    Pending
                </Button>
                <Button
                    variant={'outline'}
                    onClick={() =>
                        setRequests(
                            props.requests?.filter(
                                (request) => request.status === RequestStatus.Waitlist
                            )
                        )
                    }
                >
                    Waitlisted
                </Button>
            </div>
            <DataTable columns={columns} data={requests} />
        </div>
    )
}
