import DefaultPageLayout from '@/app/(default)/layout'
import ShopItem from '@/components/artist-page/shop-item'

export default async function ArtistShopView({params}: { params: { handle: string, slug: string }}) {
    return (
        <DefaultPageLayout>
            <div className="xl:max-w-[85%] mx-auto">
                <ShopItem handle={params.handle} slug={params.slug} />
            </div>
        </DefaultPageLayout>
    )
}
