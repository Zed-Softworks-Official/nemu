import { GraphQLFetcher } from '@/core/helpers'
import ShopCard from '../dashboard/shop/shop-card'
import { ShopResponse } from '@/core/responses'
import {ShopItem} from '@/core/structures'
import useSWR from 'swr'

export default async function Shop({
    user_id,
    handle
}: {
    user_id: string
    handle: string
}) {
    const {data, isLoading} = useSWR(``, GraphQLFetcher)

    if (isLoading) {
        return null
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* {data.products?.map((item: ShopItem) => (
                <ShopCard key={item.name} product={item} handle={handle} />
            ))} */}
            {JSON.stringify(data)}
        </div>
    )
}
