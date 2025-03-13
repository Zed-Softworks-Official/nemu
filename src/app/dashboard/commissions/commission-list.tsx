'use client'

import Link from 'next/link'
import { Eye, MoreHorizontal, Paintbrush } from 'lucide-react'

import { api, type RouterOutputs } from '~/trpc/react'

import { Button } from '~/app/_components/ui/button'
import { Badge, type BadgeProps } from '~/app/_components/ui/badge'

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent
} from '~/app/_components/ui/card'
import Loading from '~/app/_components/ui/loading'
import { DataTable } from '~/app/_components/data-table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'

type CommissionList = RouterOutputs['commission']['getCommissionList']
type Commission = RouterOutputs['commission']['getCommissionList'][number]

export function CommissionList() {
    const { data, isLoading } = api.commission.getCommissionList.useQuery()

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loading />
            </div>
        )
    }

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

function CommissionTable(props: { commissions: CommissionList }) {
    return (
        <div className="mb-4 flex flex-col space-x-4">
            <DataTable
                columnDefs={[
                    {
                        field: 'title',
                        headerName: 'Title',
                        flex: 1
                    },
                    {
                        field: 'price',
                        headerName: 'Price'
                    },
                    {
                        field: 'availability',
                        headerName: 'Availability',
                        cellRenderer: ({ data }: { data: Commission }) => {
                            let variant: BadgeProps['variant'] = 'default'
                            switch (data.availability) {
                                case 'open':
                                    variant = 'default'
                                    break
                                case 'closed':
                                    variant = 'destructive'
                                    break
                                case 'waitlist':
                                    variant = 'warning'
                                    break
                            }

                            return <Badge variant={variant}>{data.availability}</Badge>
                        }
                    },
                    {
                        field: 'published',
                        headerName: 'Published'
                    },
                    {
                        flex: 1,
                        field: 'slug',
                        headerName: 'Actions',
                        cellRenderer: ({ data }: { data: Commission }) => {
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
                                        className="w-(--radix-popper-arrow-size)"
                                    >
                                        <DropdownMenuItem asChild>
                                            <Link
                                                href={`/dashboard/commissions/${data.id}`}
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
                ]}
                rowData={props.commissions}
            />
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
                    <Paintbrush className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Published</CardTitle>
                    <Paintbrush className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                    <Paintbrush className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">New Requests</CardTitle>
                    <Paintbrush className="text-muted-foreground h-4 w-4" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">0</div>
                </CardContent>
            </Card>
        </div>
    )
}
