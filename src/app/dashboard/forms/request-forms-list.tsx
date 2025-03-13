'use client'

import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'

import { Button } from '~/app/_components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'
import Loading from '~/app/_components/ui/loading'
import { api } from '~/trpc/react'
import { DataTable } from '~/app/_components/data-table'

export default function RequestFormsList() {
    const { data: forms, isLoading } = api.request.getFormsListAndPaymentMethod.useQuery()

    if (isLoading) return <Loading />

    if (!forms) return null

    return (
        <DataTable
            columnDefs={[
                {
                    field: 'name',
                    headerName: 'Name'
                },
                {
                    field: 'description',
                    headerName: 'Description',
                    flex: 1
                },
                {
                    headerName: 'Actions',
                    field: 'id',
                    flex: 1,
                    cellRenderer: ({ data }: { data: (typeof forms.forms)[number] }) => {
                        return (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem asChild>
                                        <Link href={`/dashboard/forms/${data.id}`}>
                                            Edit
                                        </Link>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )
                    }
                }
            ]}
            rowData={forms.forms}
        />
    )
}
