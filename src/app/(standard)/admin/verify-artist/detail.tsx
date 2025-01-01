'use client'

import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '~/components/data-table'
import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'

export default function VertificationDataTable() {
    const { data, isLoading } =
        api.artist_verification.get_artist_verifications.useQuery()

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loading />
            </div>
        )
    }

    if (!data) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <NemuImage src="/nemu/sad.png" alt="Nemu Logo" />
                <p className="text-2xl font-bold">No data found</p>
            </div>
        )
    }

    const columns: ColumnDef<(typeof data)[number]>[] = [
        {
            accessorKey: 'requested_handle',
            header: 'Handle'
        },
        {
            accessorKey: 'twitter',
            header: 'Twitter'
        },
        {
            accessorKey: 'website',
            header: 'Website'
        },
        {
            accessorKey: 'created_at',
            header: 'Created At'
        }
    ]

    return <DataTable columns={columns} data={data} />
}
