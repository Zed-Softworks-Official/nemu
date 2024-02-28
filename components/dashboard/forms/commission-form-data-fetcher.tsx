'use client'

import Loading from '@/components/loading'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { GraphQLFetcher } from '@/core/helpers'
import { Commission } from '@prisma/client'
import useSWR from 'swr'
import CommissionCreateEditForm from './commission-create-edit-form'
import { CommissionImagesResponse } from '@/core/responses'

export default function CommissionFormDataFetcher({ slug }: { slug?: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        slug
            ? `{
                    commission(artist_id:"${artistId}", slug:"${slug}") {
                        id
                        title
                        description
                        price
                        useInvoicing
                        formId
                        rushOrdersAllowed
                        rushCharge
                        rushPercentage
                        maxCommissionsUntilWaitlist
                        maxCommissionsUntilClosed
                        availability
                        get_images {
                            images {
                                file_key
                                file_name
                                signed_url
                                aws_location
                                featured
                            }
                        }
                    }
                }`
            : null,
        GraphQLFetcher<{ commission: Commission & { get_images: CommissionImagesResponse } }>
    )

    if (isLoading) {
        return <Loading />
    }

    return <CommissionCreateEditForm data={data} />
}
