'use client'

import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'

import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'
import { DataTable } from '~/components/data-table'

export default function RequestFormsList() {
    const { data: forms, isLoading } = api.request_form.get_forms_list.useQuery()

    if (isLoading) return <Loading />

    if (!forms) return null

    const columns: ColumnDef<(typeof forms)[number]>[] = [
        {
            header: 'Name',
            accessorKey: 'name'
        },
        {
            header: 'Description',
            accessorKey: 'description'
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const form = row.original

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem>
                                <Link href={`/dashboard/request-forms/${form.id}`}>
                                    Edit
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        }
    ]

    return <DataTable columns={columns} data={forms} />
}
