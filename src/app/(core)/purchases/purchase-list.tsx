'use client'

import { Download } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '~/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'

export default function PurchaseList() {
    const { data, isLoading, isFetching, fetchNextPage, hasNextPage } =
        api.artistCorner.getPurchased.useInfiniteQuery(
            {
                limit: 10
            },
            {
                getNextPageParam: (lastPage) => lastPage.nextCursor
            }
        )

    // Flatten the pages data
    const purchases = data?.pages.flatMap((page) => page.items) ?? []

    if (isLoading) {
        return <Loading />
    }

    if (purchases.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <h3 className="text-lg font-medium">No purchases yet</h3>
                <p className="text-muted-foreground mt-2">
                    When you purchase products from artists, they&apos;ll appear here.
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {purchases.map((purchase) => (
                <Card
                    key={purchase.id}
                    className="flex flex-row items-center justify-between"
                >
                    <CardHeader>
                        <CardTitle>{purchase.product.title}</CardTitle>
                        <CardDescription>
                            <span className="block">By {purchase.artist.handle}</span>
                            <span className="text-muted-foreground text-xs">
                                Purchased{' '}
                                {formatDistanceToNow(purchase.createdAt ?? new Date(), {
                                    addSuffix: true
                                })}
                            </span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DownloadButton
                            productId={purchase.product.id}
                            filename={purchase.product.download.filename}
                        />
                    </CardContent>
                </Card>
            ))}

            {hasNextPage && (
                <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => fetchNextPage()}
                    disabled={isFetching}
                >
                    {isFetching ? 'Loading...' : 'Load More'}
                </Button>
            )}

            {!hasNextPage && purchases.length > 0 && (
                <p className="text-muted-foreground mt-4 text-center text-sm">
                    You&apos;ve reached the end of your purchase history.
                </p>
            )}
        </div>
    )
}

function DownloadButton(props: { productId: string; filename: string }) {
    const [isDownloading, setIsDownloading] = useState(false)

    const handleDownload = () => {
        setIsDownloading(true)
        setTimeout(() => setIsDownloading(false), 2000)
    }

    return (
        <Button size={'lg'} disabled={isDownloading} asChild>
            <Link
                href={`/api/download/${props.productId}`}
                download={props.filename}
                onClick={handleDownload}
            >
                <Download className="size-4" />
                Download
            </Link>
        </Button>
    )
}
