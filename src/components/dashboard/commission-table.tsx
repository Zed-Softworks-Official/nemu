'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MoreHorizontal, Eye } from 'lucide-react'

import { type ColumnDef } from '@tanstack/react-table'

import type { ClientCommissionItem } from '~/core/structures'

import DataTable from '~/components/data-table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'

export default function CommissionTable(props: { commissions: ClientCommissionItem[] }) {
    const [filteredCommissions, setFilteredCommissions] = useState<
        ClientCommissionItem[]
    >(props.commissions)

    const columns: ColumnDef<ClientCommissionItem>[] = [
        {
            accessorKey: 'title',
            header: 'Title'
        },
        {
            accessorKey: 'price',
            header: 'Price'
        },
        {
            accessorKey: 'rating',
            header: 'Rating'
        },
        {
            accessorKey: 'published',
            header: 'Published',
            cell: ({ row }) => {
                return (
                    <Badge variant={row.original.published ? 'default' : 'destructive'}>
                        {row.original.published ? 'Published' : 'Unpublished'}
                    </Badge>
                )
            }
        },
        {
            id: 'Actions',
            cell: ({ row }) => {
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'ghost'} className="h-8 w-8 p-0">
                                <span className="sr-only">Open Menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            side="bottom"
                            className="w-[--radix-popper-arrow-size]"
                        >
                            <DropdownMenuItem asChild>
                                <Link
                                    href={`/dashboard/commissions/${row.original.slug}`}
                                >
                                    <Eye className="h-6 w-6" />
                                    View
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        }
    ]

    return (
        <div className="mb-4 flex flex-col space-x-4">
            <div className="mb-4 flex items-center gap-2">
                <Button
                    size="sm"
                    variant={'outline'}
                    onClick={() => setFilteredCommissions(props.commissions)}
                >
                    All
                </Button>
                <Button
                    size="sm"
                    variant={'outline'}
                    onClick={() =>
                        setFilteredCommissions(
                            props.commissions.filter((c) => c.published)
                        )
                    }
                >
                    Published
                </Button>
                <Button
                    size="sm"
                    variant={'outline'}
                    onClick={() =>
                        setFilteredCommissions(
                            props.commissions.filter((c) => !c.published)
                        )
                    }
                >
                    Unpublished
                </Button>
            </div>
            <DataTable columns={columns} data={filteredCommissions} />
        </div>
    )
}
