import { Suspense } from 'react'
import { DataTable } from '~/app/_components/data-table'

import { DashboardCreateButton } from '~/app/_components/ui/button'
import Loading from '~/app/_components/ui/loading'
import { isOnboarded } from '~/lib/flags'
import { api } from '~/trpc/server'

export default async function ArtistCornerDashboard() {
    const onboarded = await isOnboarded()

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">Products</h1>
                <DashboardCreateButton
                    onboarded={onboarded}
                    text="Create Product"
                    href="/dashboard/products/create"
                />
            </div>

            <Suspense fallback={<Loading />}>
                <Products />
            </Suspense>
        </div>
    )
}

async function Products() {
    const products = await api.artistCorner.getProducts()

    return (
        <DataTable
            columnDefs={[
                {
                    headerName: 'Title',
                    field: 'title'
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
                url: `/dashboard/products`,
                field: 'id',
                actionText: 'View'
            }}
        />
    )
}
