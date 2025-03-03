'use client'

import { DownloadIcon } from 'lucide-react'
import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { getUTUrl } from '~/lib/utils'
import { useOrder } from '~/components/orders/standard-order'

export default function Delivery() {
    const { request_data } = useOrder()

    if (!request_data?.delivery) {
        return (
            <Card>
                <CardHeader className="flex h-full w-full items-center justify-center">
                    <NemuImage
                        src={'/nemu/sad.png'}
                        alt="Not Like This"
                        width={200}
                        height={200}
                    />
                    <CardTitle>No Downloads Yet!</CardTitle>
                </CardHeader>
            </Card>
        )
    }

    return (
        <main className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <CardTitle>Delivery</CardTitle>
                    <CardDescription>
                        <p>Download files here.</p>
                        <p>{request_data.delivery.updatedAt.toLocaleDateString()}</p>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center">
                        <Button
                            size={'lg'}
                            onClick={() => {
                                const download_url = getUTUrl(
                                    request_data.delivery?.utKey ?? 'Unknown'
                                )

                                // Create an anchor element and trigger download
                                const link = document.createElement('a')
                                link.href = download_url
                                link.download = `delivery-${request_data.commission?.title}-${request_data.delivery?.version}` // Set filename
                                document.body.appendChild(link)
                                link.click()
                                document.body.removeChild(link)
                            }}
                        >
                            <DownloadIcon className="h-10 w-10" />
                            Download
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </main>
    )
}
