import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'
import { Separator } from '~/components/ui/separator'

import { api } from '~/trpc/server'
import { type RouterOutputs } from '~/trpc/react'
import { HomeCarousel } from '../(home)/carousel'
import { InfiniteProducts } from './products'

export default function ArtistCornerPage() {
    return (
        <div className="container mx-auto mb-4">
            <HomeCarousel />
            <Suspense fallback={<Loading />}>
                <FeaturedProducts />
            </Suspense>

            <Separator className="my-4" />
            <InfiniteProducts />
        </div>
    )
}

async function FeaturedProducts() {
    const featured_products = await api.home.getFeaturedProducts()

    if (!featured_products) return null

    return (
        <div className="mx-auto grid max-w-[--breakpoint-2xl] gap-4 pt-5 md:grid-cols-6 md:grid-rows-2 lg:max-h-[calc(100vh-200px)]">
            <div className="md:col-span-4 md:row-span-2">
                <Product product={featured_products[0]} />
            </div>
            <div className="md:col-span-2 md:row-span-1">
                <Product product={featured_products[1]} />
            </div>
            <div className="md:col-span-2 md:row-span-1">
                <Product product={featured_products[2]} />
            </div>
        </div>
    )
}

function Product(props: {
    product?: NonNullable<RouterOutputs['home']['getFeaturedProducts'][number]>
}) {
    if (!props.product) return null

    return (
        <Link
            href={`/@${props.product.artist.handle}/artist-corner/${props.product.id}`}
            className="relative block aspect-square h-full w-full"
        >
            <div className="group bg-secondary hover:border-primary relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border">
                <NemuImage
                    src={props.product.featuredImage}
                    alt="/"
                    width={300}
                    height={300}
                />
                <div className="@container/label absolute bottom-0 left-0 flex h-fit w-full px-4 pb-4 lg:px-10 lg:pb-[10%]">
                    <div className="bg-background/80 text-foreground flex items-center rounded-md border p-1 text-xs font-semibold backdrop-blur-md">
                        <div className="flex flex-col">
                            <h3 className="mr-4 line-clamp-2 grow pl-2 text-sm leading-none tracking-tight">
                                {props.product.title}
                            </h3>
                            <span className="text-muted-foreground pr-2 pl-2 text-xs">
                                @{props.product.artist.handle}
                            </span>
                        </div>
                        <p className="bg-primary text-foreground flex-none rounded-md p-2">
                            {props.product.price}
                        </p>
                    </div>
                </div>
            </div>
        </Link>
    )
}
