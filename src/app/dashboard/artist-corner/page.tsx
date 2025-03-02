import { Suspense } from 'react'
import { DataTable } from '~/components/data-table'

import { DashboardCreateButton } from '~/components/ui/button'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/server'

export default async function ArtistCornerDashboard() {
    const dashboardLinks = await api.stripe.getDashboardLinks()

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">Artist Corner</h1>
                <DashboardCreateButton
                    onboarded={dashboardLinks.onboarded}
                    text="Create Product"
                    href="/dashboard/artist-corner/create"
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
