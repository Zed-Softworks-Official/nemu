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
import Loading from '~/components/ui/loading'
import { get_ut_url } from '~/lib/utils'

import { api } from '~/trpc/react'

export default function Delivery(props: { order_id: string }) {
    const { data: request, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: props.order_id
    })

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loading />
            </div>
        )
    }

    if (!request?.delivery) {
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
                        <p>{request.delivery.updated_at.toLocaleDateString()}</p>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center">
                        <Button
                            size={'lg'}
                            onClick={() => {
                                const download_url = get_ut_url(
                                    request.delivery?.ut_key ?? 'Unknown'
                                )

                                // Create an anchor element and trigger download
                                const link = document.createElement('a')
                                link.href = download_url
                                link.download = `delivery-${request.commission?.title}-${request.delivery?.version}` // Set filename
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
