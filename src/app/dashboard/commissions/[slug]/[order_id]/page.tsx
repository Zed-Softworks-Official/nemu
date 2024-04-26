import { notFound } from 'next/navigation'
import DashboardContainer from '~/components/ui/dashboard-container'
import { api } from '~/trpc/server'

export default async function CommissionOrderDetailPage({
    params
}: {
    params: { slug: string; order_id: string }
}) {
    const request = await api.requests.get_request(params.order_id)

    if (!request) {
        return notFound()
    }

    return (
        <DashboardContainer title={`Request for ${request.user.name}`}>
            <>Hello, World!</>
        </DashboardContainer>
    )
}
