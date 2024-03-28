import DefaultPageLayout from '@/app/(default)/layout'
import ShopPageClient from '@/components/artist-page/shop-page-client'
import { ImageData, ShopItem } from '@/core/structures'
import { Metadata, ResolvingMetadata } from 'next'

type Props = {
    params: { handle: string; slug: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const handle = params.handle.substring(3, params.handle.length)

    const response = await fetch(
        `${process.env.BASE_URL}/api/metadata/${handle}/${params.slug}`
    )
    const json = (await response.json()) as {
        title: string
        description: string
        featured_image: ImageData
    }

    return {
        title: `Nemu | @${handle} | ${json.title}`,
        description: 'Some description goes here',
        openGraph: {
            title: json.title,
            images: [json.featured_image.signed_url]
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
