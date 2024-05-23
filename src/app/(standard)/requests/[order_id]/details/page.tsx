import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { RequestContent } from '~/core/structures'
import { api } from '~/trpc/server'

export default async function RequestsDetailPage({
    params
}: {
    params: { order_id: string }
}) {
    const request = await api.requests.get_request_details(params.order_id)

    if (!request || !request.commission) {
        return notFound()
    }

    const request_data = request.content as RequestContent

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <CardTitle>{request.commission.title}</CardTitle>
                    <CardDescription>
                        By{' '}
                        <Link
                            href={`/@${request.commission.artist?.handle}`}
                            className="link-hover link"
                        >
                            @{request.commission.artist?.handle}
                        </Link>
                    </CardDescription>
                </CardHeader>
                <div className="divider"></div>
                <CardContent>
                    <div className="flex flex-col gap-5">
                        {Object.keys(request_data).map((key) => (
                            <div key={key} className="flex flex-col">
                                <h1 className="text-xl font-semibold">
                                    {request_data[key]?.label}
                                </h1>
                                <p>{request_data[key]?.value}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
