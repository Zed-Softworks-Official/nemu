import DefaultPageLayout from '@/app/(default)/layout'
import ShopItem from '@/components/artist-page/shop-item'

export default async function ArtistShopView() {
    return (
        <DefaultPageLayout>
            <div className="xl:max-w-[85%] mx-auto">
                <ShopItem />
            </div>
        </DefaultPageLayout>
    )
}
