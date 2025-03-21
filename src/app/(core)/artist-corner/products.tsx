'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { useIntersectionObserver } from '@uidotdev/usehooks'

import NemuImage from '~/app/_components/nemu-image'
import { api } from '~/trpc/react'
import Loading from '~/app/_components/ui/loading'
import type { ProductResult } from '~/lib/types'

export function InfiniteProducts() {
    const [ref, entry] = useIntersectionObserver({
        root: null,
        threshold: 0,
        rootMargin: '0px'
    })

    const query = api.home.getProductsInfinite.useInfiniteQuery(
        {
            limit: 10
        },
        {
            getNextPageParam: (lastPage) => {
                if (!lastPage.ok) {
                    toast.error(lastPage.error.message)
                    return undefined
                }

                return lastPage.data.nextCursor
            }
        }
    )

    useEffect(() => {
        if (entry?.isIntersecting && !query.isFetching && query.hasNextPage) {
            void query.fetchNextPage()
        }
    }, [entry, query])

    return (
        <div className="mt-10 flex h-full w-full flex-1 flex-col items-center justify-center gap-5">
            <motion.div
                className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3 xl:columns-4"
                animate={'visible'}
                variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                        opacity: 1
                    }
                }}
                initial={'hidden'}
            >
                {query.data?.pages.map((page) => {
                    if (!page.ok) {
                        toast.error(page.error.message)
                        return null
                    }

                    return page.data.res.map((product) => (
                        <motion.div
                            key={product.id}
                            initial={'hidden'}
                            animate={'visible'}
                            variants={{
                                hidden: { opacity: 0, y: 20 },
                                visible: { opacity: 1, y: 0 }
                            }}
                            className="break-inside-avoid"
                        >
                            <ProductCard product={product} />
                        </motion.div>
                    ))
                })}
            </motion.div>
            <div ref={ref}></div>
            {query.isLoading && <Loading />}
        </div>
    )
}

export function ProductCard(props: { product: ProductResult }) {
    if (!props.product) return null

    return (
        <Link
            href={`/@${props.product.artist.handle}/artist-corner/${props.product.id}`}
            className="relative block aspect-square h-full w-full"
            scroll={false}
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
