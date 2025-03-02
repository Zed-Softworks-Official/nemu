import Link from 'next/link'
import { type Metadata } from 'next'
import { CreditCard } from 'lucide-react'
import { notFound } from 'next/navigation'

import { Button } from '~/components/ui/button'
import ImageViewer from '~/components/ui/image-viewer'
import { MarkdownEditor } from '~/components/ui/markdown-editor'
import { Separator } from '~/components/ui/separator'

import { api } from '~/trpc/server'

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
        description: `Get ${product.name} from @${handle} on Nemu!`,
        twitter: {
            title: `Nemu | @${handle}`,
            description: `Get ${product.name} from @${handle} on Nemu!`,
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
        <div className="container mx-auto">
            <ProductView id={id} handle={handle.substring(3, handle.length)} />
        </div>
    )
}

async function ProductView(props: { id: string; handle: string }) {
    const product = await api.artistCorner.getProductById({
        id: props.id
    })

    if (!product) {
        return notFound()
    }

    return (
        <div className="flex flex-col rounded-lg border p-8 md:p-12 lg:flex-row lg:gap-8">
            <div className="basis-full lg:basis-4/6">
                <ImageViewer
                    images={product.images.map((value) => ({
                        url: value
                    }))}
                />
            </div>
            <div className="bg-secondary basis-full rounded-md p-6 shadow-xl lg:basis-2/6">
                <div className="mb-6 flex flex-col">
                    <h1 className="mb-2 text-4xl font-medium">{product.name}</h1>
                    <span className="text-muted-foreground">
                        By{' '}
                        <Link href={`/@${props.handle}`} className="hover:underline">
                            @{props.handle}
                        </Link>
                    </span>
                    <div className="bg-primary text-foreground mt-10 mr-auto w-auto rounded-md p-2 text-sm">
                        {product.price}
                    </div>
                </div>
                <Separator className="my-6" />
                <div className="flex flex-1">
                    <MarkdownEditor content={product.description} disabled />
                </div>
                <Button
                    size={'lg'}
                    className="mt-6 w-full cursor-pointer uppercase"
                    asChild
                >
                    <Link href={`/@${props.handle}/artist-corner/${props.id}/purchase`}>
                        <CreditCard className="size-4" />
                        Take my money!
                    </Link>
                </Button>
            </div>
        </div>
    )
}
