'use client'

import { type Dispatch, type SetStateAction, useState, useCallback } from 'react'
import Link from 'next/link'
import { Check, MoreHorizontal, X } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'

import {
    type ClientRequestData,
    type RequestContent,
    RequestStatus
} from '~/core/structures'

import { Badge } from '~/components/ui/badge'
import DataTable from '~/components/data-table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { Button } from '~/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '~/components/ui/dialog'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

import { determine_request } from '~/server/actions/requests'

export default function CommissionRequestTable(props: { requests: ClientRequestData[] }) {
    const [open, setOpen] = useState(false)
    const [currentRequest, setCurrentRequest] = useState<ClientRequestData | null>(null)

    const columns: ColumnDef<ClientRequestData>[] = [
        {
            accessorKey: 'user.username',
            header: 'Username'
        },
        {
            accessorKey: 'created_at',
            header: 'Date Submitted',
            cell: ({ row }) => {
                const date_formated = new Date(
                    row.getValue('created_at')
                ).toLocaleDateString()

                return date_formated
            }
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const status: RequestStatus = row.getValue('status')

                return <Badge>{status}</Badge>
            }
        },
        {
            id: 'Actions',
            cell: ({ row }) => {
                const status: RequestStatus = row.getValue('status')

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'ghost'} className="h-8 w-8 p-0">
                                <span className="sr-only">Open Menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <CommissionViewRequest
                                request_data={row.original}
                                status={status}
                                setCurrentRequest={setCurrentRequest}
                                setOpen={setOpen}
                            />
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        }
    ]

    return (
        <div>
            <DataTable columns={columns} data={props.requests} />
            <CommissionDialog
                request_data={currentRequest}
                open={open}
                setOpen={setOpen}
            />
        </div>
    )
}

function CommissionViewRequest(props: {
    request_data: ClientRequestData
    status: RequestStatus
    setCurrentRequest: (request: ClientRequestData) => void
    setOpen: Dispatch<SetStateAction<boolean>>
}) {
    if (props.status === RequestStatus.Accepted) {
        return (
            <DropdownMenuItem asChild>
                <Link href={'/'}>View Request</Link>
            </DropdownMenuItem>
        )
    }

    return (
        <DropdownMenuItem
            onClick={() => {
                props.setOpen(true)
                props.setCurrentRequest(props.request_data)
            }}
        >
            View Request
        </DropdownMenuItem>
    )
}

function CommissionDialog(props: {
    request_data: ClientRequestData | null
    open: boolean
    setOpen: Dispatch<SetStateAction<boolean>>
}) {
    const [pending, setPending] = useState(false)
    const dialog_action = useCallback(
        async (action: boolean) => {
            const toast_id = toast.loading('Accepting Request')
            setPending(true)

            if (!props.request_data) {
                toast.error('Failed to accept request', {
                    id: toast_id
                })
                setPending(false)

                return
            }

            const res = await determine_request(props.request_data.id, action)

            if (!res.success) {
                toast.error('Failed to accept request!', {
                    id: toast_id
                })
                setPending(false)

                return
            }

            toast.success('Request Accepted!', {
                id: toast_id
            })
        },
        [props.request_data]
    )

    if (!props.request_data) return null

    const request_content = props.request_data.content as RequestContent

    return (
        <Dialog open={props.open} onOpenChange={props.setOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        Request for {props.request_data.user.username}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-5">
                    {Object.keys(request_content).map((key) => (
                        <Card key={key}>
                            <CardHeader>
                                <CardTitle>{request_content[key]?.label}</CardTitle>
                                <CardDescription>
                                    {request_content[key]?.value}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                    <div className="flex w-full flex-row items-center justify-between">
                        <DialogClose disabled={pending} asChild>
                            <Button
                                variant={'destructive'}
                                onClick={() => dialog_action(false)}
                            >
                                <X className="h-6 w-6" />
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button disabled={pending} onClick={() => dialog_action(true)}>
                            <Check className="h-6 w-6" />
                            Accept
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
