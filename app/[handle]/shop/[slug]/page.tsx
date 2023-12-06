import DefaultPageLayout from '@/app/(default)/layout'
import ShopDisplay from '@/components/artist-page/shop-item'

export default async function ArtistShopView({
    params
}: {
    params: { handle: string; slug: string }
}) {
    return (
        <DefaultPageLayout>
            <ShopDisplay handle={params.handle} slug={params.slug} />
        </DefaultPageLayout>
    )
}
