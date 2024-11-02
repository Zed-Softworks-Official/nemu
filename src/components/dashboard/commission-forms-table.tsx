'use client'

import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import type { InferSelectModel } from 'drizzle-orm'
import { MoreHorizontal } from 'lucide-react'

import type { forms } from '~/server/db/schema'

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { Button } from '~/components/ui/button'
import DataTable from '~/components/data-table'

export default function CommissionFormsTable(props: {
    forms: InferSelectModel<typeof forms>[]
}) {
    const columns: ColumnDef<InferSelectModel<typeof forms>>[] = [
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
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'ghost'}>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/forms/${row.original.id}`}>
                                    Edit Form
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        }
    ]

    return <DataTable columns={columns} data={props.forms} />
}
