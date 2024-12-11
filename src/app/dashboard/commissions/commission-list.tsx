'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '~/components/ui/button'
import { Eye, MoreHorizontal, Paintbrush } from 'lucide-react'

import { api } from '~/trpc/react'

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent
} from '~/components/ui/card'
import Loading from '~/components/ui/loading'
import { DataTable } from '~/components/data-table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'

import type { ClientCommissionItem } from '~/core/structures'

export function CommissionList() {
    const { data, isLoading } = api.commission.get_commission_list.useQuery()

    if (isLoading) return <Loading />

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Commission List</CardTitle>
                <CardDescription>
                    Manage your art commissions and track requests.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <CommissionTable commissions={data ?? []} />
            </CardContent>
        </Card>
    )
}

function CommissionTable(props: { commissions: ClientCommissionItem[] }) {
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
            accessorKey: 'published',
            header: 'Published'
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

export function CommissionStats() {
    return (
        <div className="grid gap-6 md:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Total Commissions
                    </CardTitle>
                    <Paintbrush className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Published</CardTitle>
                    <Paintbrush className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                    <Paintbrush className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">New Requests</CardTitle>
                    <Paintbrush className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
        </div>
    )
}
