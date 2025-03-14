'use client'

import Link from 'next/link'
import { QrCode } from 'lucide-react'

import Loading from '~/app/_components/ui/loading'
import { DataTable } from '~/app/_components/data-table'
import { api, type RouterOutputs } from '~/trpc/react'
import { Button } from '~/app/_components/ui/button'

export function ConTable() {
    const { data: cons, isLoading } = api.con.getCons.useQuery()

    if (isLoading) return <Loading />

    return (
        <DataTable
            columnDefs={[
                {
                    headerName: 'Name',
                    field: 'name'
                },
                {
                    headerName: 'Expires at',
                    field: 'expiresAt',
                    filter: 'agDateColumnFilter'
                },
                {
                    headerName: 'Sign Ups',
                    field: 'signUpCount'
                },
                {
                    headerName: 'Slug',
                    field: 'slug',
                    flex: 1,
                    onCellClicked: (params) => {
                        void navigator.clipboard.writeText(
                            `https://nemu.art/cons/${params.data?.slug}`
                        )
                    }
                },
                {
                    headerName: 'Qr Code',
                    field: 'id',
                    flex: 1,
                    cellRenderer: ({
                        data
                    }: {
                        data: RouterOutputs['con']['getCons'][number]
                    }) => {
                        return (
                            <Button asChild variant={'ghost'} size={'icon'}>
                                <Link href={`/admin/con/${data.id}`}>
                                    <QrCode className="size-4" />
                                </Link>
                            </Button>
                        )
                    }
                }
            ]}
            rowData={cons}
        />
    )
}
