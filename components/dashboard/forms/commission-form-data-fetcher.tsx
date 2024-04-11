'use client'

import Loading from '@/components/loading'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import CommissionCreateEditForm from './commission-create-edit-form'
import { api } from '@/core/api/react'

export default function CommissionFormDataFetcher({ slug }: { slug?: string }) {
    const { artist } = useDashboardContext()!
    const { data, isLoading } = api.commissions.get_commission_editable.useQuery({
        artist_id: artist?.id!,
        slug
    })

    if (isLoading) {
        return <Loading />
    }

    return <CommissionCreateEditForm data={data} />
}
