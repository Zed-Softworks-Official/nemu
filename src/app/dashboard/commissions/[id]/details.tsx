'use client'

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '~/app/_components/data-table'

import { Button } from '~/app/_components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'
import { type ClientRequestData } from '~/lib/types'
import { api } from '~/trpc/react'

export function PublishButton(props: { id: string; published: boolean }) {
    const [currentlyPublished, setCurrentlyPublished] = useState(props.published)
    const publishCommission = api.commission.publishCommission.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Updating Commission')
            return { toast_id: toastId }
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
                const newState = !currentlyPublished
                setCurrentlyPublished(newState)

                publishCommission.mutate({
                    id: props.id,
                    published: newState
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
    return (
        <div className="mt-5">
            <DataTable
                columnDefs={[
                    {
                        headerName: 'Username',
                        field: 'user.username'
                    },
                    {
                        headerName: 'Date',
                        field: 'createdAt',
                        cellRenderer: ({ data }: { data: ClientRequestData }) =>
                            new Date(data.createdAt).toLocaleDateString()
                    },
                    {
                        headerName: 'Status',
                        field: 'status'
                    },
                    {
                        headerName: 'Actions',
                        field: 'id',
                        flex: 1,
                        cellRenderer: ({ data }: { data: ClientRequestData }) => {
                            const request = data

                            if (
                                request.status !== 'accepted' &&
                                request.status !== 'pending'
                            ) {
                                return null
                            }

                            return (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant={'ghost'} size={'icon'}>
                                            <MoreHorizontal className="h-6 w-6" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem asChild>
                                            <Link
                                                href={`/dashboard/commissions/${props.slug}/${request.orderId}`}
                                            >
                                                View Request
                                            </Link>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )
                        }
                    }
                ]}
                rowData={props.requests}
            />
        </div>
    )
}
