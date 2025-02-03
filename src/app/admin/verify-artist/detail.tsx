'use client'

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

    return (
        <DataTable
            columnDefs={[
                {
                    field: 'requested_handle',
                    headerName: 'Handle'
                },
                {
                    field: 'twitter',
                    headerName: 'Twitter'
                },
                {
                    field: 'website',
                    headerName: 'Website'
                },
                {
                    field: 'created_at',
                    headerName: 'Created At'
                }
            ]}
            rowData={data}
        />
    )
}
