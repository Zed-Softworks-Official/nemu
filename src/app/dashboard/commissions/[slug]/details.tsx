'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '~/components/data-table'

import { Button } from '~/components/ui/button'
import { type ClientRequestData } from '~/core/structures'
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

export function RequestList(props: { requests: ClientRequestData[] | undefined }) {
    if (!props.requests) return null

    const columns: ColumnDef<ClientRequestData>[] = [
        {
            header: 'Username',
            accessorKey: 'user_id'
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
            cell: () => {
                return <>Hello, World!</>
            }
        }
    ]

    return (
        <div className="mt-5">
            <DataTable columns={columns} data={props.requests} />
        </div>
    )
}
