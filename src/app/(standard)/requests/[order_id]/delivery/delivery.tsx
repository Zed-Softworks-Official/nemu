'use client'

import { FileArchiveIcon } from 'lucide-react'
import Link from 'next/link'
import NemuImage from '~/components/nemu-image'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'

export default function Delivery(props: { order_id: string }) {
    const { data: request, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: props.order_id
    })

    if (isLoading) {
        return <Loading />
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
                    <CardTitle>Downloads</CardTitle>
                </CardHeader>
                <CardContent>
                    <DownloadPreview
                        url={request.delivery.url}
                        blur_data={request.delivery.blur_data}
                        file_type={request.delivery.file_type}
                        created_at={request.delivery.created_at}
                    />
                </CardContent>
            </Card>
        </main>
    )
}

function DownloadPreview(props: {
    url: string
    file_type: 'image' | 'zip'
    blur_data?: string
    created_at: Date
}) {
    if (props.file_type === 'image') {
        return (
            <div className="flex h-full w-full flex-row items-center justify-between gap-5">
                <NemuImage
                    src={props.url}
                    alt="Download Preview"
                    width={200}
                    height={200}
                    className="rounded-xl"
                />
                <div className="flex flex-col">
                    <span className="text-base-content/60 text-sm">
                        Download created at{' '}
                        {new Date(props.created_at).toLocaleDateString()}
                    </span>
                    <Link
                        href={props.url}
                        className="btn btn-primary btn-wide text-white"
                        download
                    >
                        Download
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-full w-full flex-row items-center justify-between gap-5">
            <FileArchiveIcon className="h-10 w-10" />
            <div className="flex flex-col">
                <span className="text-base-content/60 text-sm">
                    Download created at {new Date(props.created_at).toLocaleDateString()}
                </span>
                <Link
                    href={props.url}
                    className="btn btn-primary btn-wide text-white"
                    download
                >
                    Download
                </Link>
            </div>
        </div>
    )
}
