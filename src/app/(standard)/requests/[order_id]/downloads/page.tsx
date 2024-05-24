import { notFound } from 'next/navigation'
import NemuImage from '~/components/nemu-image'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { api } from '~/trpc/server'

export default async function RequestsDownloadsPage({
    params
}: {
    params: { order_id: string }
}) {
    const downloads = await api.requests.get_request_download(params.order_id)

    if (!downloads) {
        return notFound()
    }

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
                    <pre>{JSON.stringify(downloads, null, 2)}</pre>
                </CardContent>
            </Card>
        </main>
    )
}
