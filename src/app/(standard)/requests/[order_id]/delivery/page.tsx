import { FileArchiveIcon } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import NemuImage from '~/components/nemu-image'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import Loading from '~/components/ui/loading'
import { get_request_details } from '../details/page'

export default function RequestDeliveryPage({
    params
}: {
    params: { order_id: string }
}) {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent order_id={params.order_id} />
        </Suspense>
    )
}

async function PageContent(props: { order_id: string }) {
    const downloads = (await get_request_details(props.order_id))?.delivery

    if (!downloads) {
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
                    <CardDescription></CardDescription>
                </CardHeader>
                <CardContent>
                    <DownloadPreview
                        url={downloads.url}
                        blur_data={downloads.blur_data}
                        file_type={downloads.file_type}
                        created_at={downloads.created_at}
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
                    placeholder="blur"
                    blurDataURL={props.blur_data}
                    alt="Download Preview"
                    width={200}
                    height={200}
                    className="rounded-xl"
                />
                <div className="flex flex-col">
                    <span className="text-sm text-base-content/60">
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
                <span className="text-sm text-base-content/60">
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
