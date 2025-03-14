import { type Metadata } from 'next'

import { api } from '~/trpc/server'
import { ProductView } from '~/app/_components/product-view'

type Props = { params: Promise<{ handle: string; id: string }> }

export async function generateMetadata(props: Props) {
    const params = await props.params
    const handle = params.handle.substring(3, params.handle.length)

    const product = await api.artistCorner.getProductById({
        id: params.id
    })
    if (!product) return {}

    const image = product.images[0]
    if (!image) return {}

    return {
        title: `Nemu | @${handle}`,
        description: `Get ${product.title} from @${handle} on Nemu!`,
        twitter: {
            title: `Nemu | @${handle}`,
            description: `Get ${product.title} from @${handle} on Nemu!`,
            images: [image]
        },
        openGraph: {
            images: [image]
        }
    } satisfies Metadata
}

export default async function ArtistCornerProductPage(props: Props) {
    const { id, handle } = await props.params

    return (
        <div className="bg-background-secondary container mx-auto flex flex-col gap-5 rounded-lg p-5 shadow-xl">
            <ProductView id={id} handle={handle.substring(3, handle.length)} />
        </div>
    )
}
