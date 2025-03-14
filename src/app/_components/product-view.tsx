'use client'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CreditCard } from 'lucide-react'

import { api } from '~/trpc/react'

import ImageViewer from '~/app/_components/ui/image-viewer'
import { Separator } from '~/app/_components/ui/separator'
import { MarkdownEditor } from '~/app/_components/ui/markdown-editor'
import { Button } from '~/app/_components/ui/button'
import Loading from '~/app/_components/ui/loading'
import ShareButton from '~/app/_components/ui/share-button'
import Price from '~/app/_components/ui/price'

export function ProductView(props: { id: string; handle: string }) {
    const { data: product, isLoading } = api.artistCorner.getProductById.useQuery({
        id: props.id
    })

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loading />
            </div>
        )
    }

    if (!product) {
        return notFound()
    }

    return (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <ImageViewer
                images={product.images.map((value) => ({
                    url: value
                }))}
            />
            <div className="bg-background col-span-2 h-full overflow-y-auto rounded-xl shadow-xl">
                <div className="flex h-full max-h-fit w-full flex-1 grow-0 overflow-y-auto">
                    <div className="flex w-full flex-col gap-5 p-5">
                        <div className="flex flex-row justify-between">
                            <div>
                                <h2 className="flex items-center gap-2 text-2xl font-bold">
                                    {product.title}
                                </h2>
                                <p className="text-muted-foreground mb-4">
                                    By
                                    <Button
                                        variant={'link'}
                                        asChild
                                        className="text-muted-foreground hover:text-foreground ml-0 pl-2"
                                    >
                                        <Link
                                            prefetch={true}
                                            replace={true}
                                            href={`/@${props.handle}`}
                                        >
                                            @{props.handle}
                                        </Link>
                                    </Button>
                                </p>
                            </div>
                            <ShareButton />
                        </div>
                        <Separator />
                        <div className="h-full w-full">
                            <MarkdownEditor content={product.description} disabled />
                        </div>
                        <Separator />
                        <div className="flex w-full flex-col items-end gap-5">
                            <div className="flex w-full items-center justify-between">
                                <div className="flex flex-col items-start gap-1">
                                    <Price value={product.price} />
                                </div>
                                <Button size={'lg'} asChild>
                                    <Link
                                        href={`/@${props.handle}/artist-corner/${props.id}/purchase`}
                                    >
                                        <CreditCard className="mr-2 h-6 w-6" />
                                        Take my money!
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
