import { eq } from 'drizzle-orm'
import { FileArchiveIcon } from 'lucide-react'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import NemuImage from '~/components/nemu-image'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { get_blur_data } from '~/lib/blur_data'
import { db } from '~/server/db'
import { requests } from '~/server/db/schema'

const get_downloads = unstable_cache(
    async (order_id: string) => {
        const request = await db.query.requests.findFirst({
            where: eq(requests.order_id, order_id),
            with: {
                download: true
            }
        })

        if (!request || !request.download) {
            return undefined
        }

        const file_type: 'image' | 'zip' = request.download.url.includes('.zip')
            ? 'zip'
            : 'image'

        return {
            url: request.download.url,
            blur_data:
                file_type === 'image'
                    ? await get_blur_data(request.download.url)
                    : undefined,
            file_type,
            created_at: request.download.created_at
        }
    },
    ['request-downloads']
)

export default async function RequestDeliveryPage({
    params
}: {
    params: { order_id: string }
}) {
    const downloads = await get_downloads(params.order_id)

    if (!downloads) {
        return (
            <Card>
                <CardHeader>
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
