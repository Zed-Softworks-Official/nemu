import { notFound } from 'next/navigation'
import { api } from '~/trpc/server'

export default async function RequestsDetailPage(params: {
    params: { order_id: string }
}) {
    const request = await api.requests.get_request_client(params.params.order_id)

    if (!request) {
        return notFound()
    }

    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <pre>{JSON.stringify(request, null, 2)}</pre>
        </div>
    )
}
