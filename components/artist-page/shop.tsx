import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'
import ShopCard from '../dashboard/shop/shop-card'
import { ShopItem } from '@/core/structures'

export default function Shop({ shop_items, handle, artist_id }: { shop_items: ShopItem[]; handle: string; artist_id: string }) {
    return (
        <ResponsiveMasonry>
            <Masonry>{shop_items?.map((item: ShopItem) => <ShopCard key={item.prod_id} product={item} handle={handle} artist_id={artist_id} />)}</Masonry>
        </ResponsiveMasonry>
    )
}
