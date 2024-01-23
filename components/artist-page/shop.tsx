import ShopCard from '../dashboard/shop/shop-card'
import { ShopItem, ShopResponse } from '@/core/responses'

export default async function Shop({
    user_id,
    handle
}: {
    user_id: string
    handle: string
}) {
    const res = await fetch(`/api/stripe/${user_id}/products`)
    const data = await res.json() as ShopResponse

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.products?.map((item: ShopItem) => (
                <ShopCard key={item.name} product={item} handle={handle} />
            ))}
        </div>
    )
}
