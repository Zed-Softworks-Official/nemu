import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'
import ShopCard from '../dashboard/shop/shop-card'
import { ShopItem } from '@/core/structures'

export default function Shop({ shop_items, handle }: { shop_items: ShopItem[]; handle: string }) {
    return (
        <ResponsiveMasonry>
            <Masonry>{shop_items?.map((item: ShopItem) => <ShopCard key={item.prod_id} product={item} handle={handle} />)}</Masonry>
        </ResponsiveMasonry>
    )
}
