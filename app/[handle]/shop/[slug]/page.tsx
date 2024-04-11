import DefaultPageLayout from '@/app/(default)/layout'
import ShopPageClient from '@/components/artist-page/shop-page-client'
import { createCaller } from '@/core/api/root'
import { Metadata, ResolvingMetadata } from 'next'

type Props = {
    params: { handle: string; slug: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const handle = params.handle.substring(3, params.handle.length)

    const trpc = createCaller({ headers: undefined, session: null })
    const data = await trpc.artist_corner.get_metadata({
        handle,
        product_slug: params.slug
    })

    return {
        title: `Nemu | @${handle} | ${data.title}`,
        description: 'Check out this product on Nemu!' + data.description,
        openGraph: {
            title: data.title,
            images: [data.featured_image.signed_url]
        }
    }
}

export default function ArtistShopView({ params }: Props) {
    return (
        <DefaultPageLayout>
            <ShopPageClient handle={params.handle} slug={params.slug} />
        </DefaultPageLayout>
    )
}
