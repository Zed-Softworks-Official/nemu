'use client'

import useSWR from 'swr'
import ShopCreateEditForm from './shop-create-edit-form'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { GraphQLFetcher, GraphQLFetcherVariables } from '@/core/helpers'
import Loading from '@/components/loading'
import { ShopItem } from '@/core/structures'

export default function ShopFormDataFetcher({ product_id }: { product_id?: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        product_id
            ? {
                  query: `query GetProduct($options: DownloadOptionsInputType) {
                            artist(id: "${artistId}") {
                                product(product_id: "${product_id}", options: $options) {
                                    id 
                                    featured_image {
                                        signed_url
                                        blur_data
                                    }
                                    edit_images {
                                        signed_url
                                        file_name
                                        file_key
                                        aws_location
                                        featured
                                    }
                                    title
                                    price
                                    description
                                    downloadable_asset
                                    download_key
                                }
                            }
                        }`,
                  variables: {
                      options: {
                          get_download_asset: true,
                          editable: true,
                          get_download_key: true,
                          get_featured_image_key: true
                      }
                  }
              }
            : null,
        GraphQLFetcherVariables<{
            artist: {
                product: ShopItem
            }
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return <ShopCreateEditForm data={data?.artist.product} />
}
