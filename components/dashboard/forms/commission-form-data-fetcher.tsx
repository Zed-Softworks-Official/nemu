'use client'

import Loading from '@/components/loading'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { GraphQLFetcher } from '@/core/helpers'
import { Commission } from '@prisma/client'
import useSWR from 'swr'
import CommissionCreateEditForm from './commission-create-edit-form'

export default function CommissionFormDataFetcher({ slug }: { slug?: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        slug
            ? `{
                    commission(artist_id:"${artistId}", slug:"${slug}") {
                        title
                        description
                        price
                        useInvoicing
                        formId
                        featuredImage
                        additionalImages
                        rushOrdersAllowed
                        rushCharge
                        rushPercentage
                        maxCommissionsUntilWaitlist
                        maxCommissionsUntilClosed
                        availability
                    }
                }`
            : null,
        GraphQLFetcher<{ commission: Commission }>
    )

    if (isLoading) {
        return <Loading />
    }

    return <CommissionCreateEditForm data={data} />
}
