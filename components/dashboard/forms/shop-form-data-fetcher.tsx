'use client'

import ShopCreateEditForm from './shop-create-edit-form'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import Loading from '@/components/loading'
import { api } from '@/core/api/react'

export default function ShopFormDataFetcher({ product_id }: { product_id?: string }) {
    const { artist } = useDashboardContext()!
    const { data, isLoading } = api.artist_corner.get_product_editable.useQuery({
        artist_handle: artist?.handle!,
        product_id: product_id,
        options: {
            get_download_asset: true,
            editable: true,
            get_download_key: true,
            get_featured_image_key: true
        }
    })

    if (isLoading) {
        return <Loading />
    }

    return <ShopCreateEditForm data={data} />
}
