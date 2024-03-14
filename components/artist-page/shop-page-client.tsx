'use client'

import { GraphQLFetcher } from '@/core/helpers'
import { ShopItem } from '@/core/structures'
import useSWR from 'swr'
import Loading from '../loading'
import ShopDisplay from './shop-display'

export default function ShopPageClient({ handle, slug }: { handle: string; slug: string }) {
    const { data, isLoading } = useSWR(
        `{
            artist(handle:"${handle.substring(3, handle.length)}") {
                id
                handle
                product(slug: "${slug}") {
                    title
                    description
                    featured_image {
                        signed_url
                        blur_data
                    }
                    images {
                        signed_url
                        blur_data
                        image_key
                    }
                    price
                    id
                    stripe_account
                }
            }
        }`,
        GraphQLFetcher<{
            artist: {
                id: string
                handle: string
                product: ShopItem
            }
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return <ShopDisplay handle={data?.artist.handle!} product={data?.artist.product!} artist_id={data?.artist.id!} />
}
