'use client'

import { Download } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

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
    const { data, isLoading } = api.artist_corner.get_purchased.useQuery()

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="flex flex-col gap-4">
            {data?.map((purchase) => (
                <Card
                    key={purchase.id}
                    className="flex flex-row items-center justify-between"
                >
                    <CardHeader>
                        <CardTitle>{purchase.product.name}</CardTitle>
                        <CardDescription>{purchase.artist.handle}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DownloadButton
                            product_id={purchase.product.id}
                            filename={purchase.product.download.filename}
                        />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

function DownloadButton(props: { product_id: string; filename: string }) {
    const [isDownloading, setIsDownloading] = useState(false)

    const handleDownload = () => {
        setIsDownloading(true)
        setTimeout(() => setIsDownloading(false), 2000)
    }

    return (
        <Button size={'lg'} disabled={isDownloading} asChild>
            <Link
                href={`/api/download/${props.product_id}`}
                download={props.filename}
                onClick={handleDownload}
            >
                <Download className="size-4" />
                Download
            </Link>
        </Button>
    )
}
