import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { DataTable } from '~/components/data-table'

import { Button } from '~/components/ui/button'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/server'

export default function ArtistCornerDashboard() {
    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">Artist Corner</h1>
                <Button asChild>
                    <Link href="/dashboard/artist-corner/create">
                        <span className="sr-only">Create Product</span>
                        <Plus className="size-4" />
                    </Link>
                </Button>
            </div>

            <Suspense fallback={<Loading />}>
                <Products />
            </Suspense>
        </div>
    )
}

async function Products() {
    const products = await api.artist_corner.get_products()

    return (
        <DataTable
            columnDefs={[
                {
                    headerName: 'Name',
                    field: 'name'
                },
                {
                    headerName: 'Price',
                    field: 'price'
                },
                {
                    headerName: 'Published',
                    field: 'published'
                }
            ]}
            rowData={products}
            columnActionData={{
                url: `/dashboard/artist-corner`,
                field: 'id',
                actionText: 'View'
            }}
        />
    )
}
