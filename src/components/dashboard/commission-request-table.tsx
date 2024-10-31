'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'

import { type ClientRequestData, RequestStatus } from '~/core/structures'

import { Badge } from '~/components/ui/badge'
import DataTable from '~/components/data-table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { Button } from '~/components/ui/button'

import { determine_request } from '~/server/actions/requests'

export default function CommissionRequestTable(props: { requests: ClientRequestData[] }) {
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

                return <>{date_formated}</>
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
                const request_id: string = row.getValue('id')

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
                                request_id={request_id}
                                status={status}
                            />
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        }
    ]

    return <DataTable columns={columns} data={props.requests} />
}

function CommissionViewRequest(props: { request_id: string; status: RequestStatus }) {
    const [open, setOpen] = useState(false)

    if (props.status === RequestStatus.Accepted) {
        return (
            <DropdownMenuItem asChild>
                <Link href={'/'}>View Request</Link>
            </DropdownMenuItem>
        )
    }

    return <DropdownMenuItem>View Request</DropdownMenuItem>
}
