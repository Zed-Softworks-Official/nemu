import { notFound } from 'next/navigation'
import Kanban from '~/components/kanban/kanban'
import DashboardContainer from '~/components/ui/dashboard-container'
import { KanbanContainerData, KanbanTask } from '~/core/structures'
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

    const kanban = await api.kanban.get_kanban(request.id)

    if (!kanban) {
        return null
    }

    return (
        <DashboardContainer title={`Request for ${request.user.name}`}>
            <Kanban
                client={request.user.name!}
                title={request.commission.title}
                kanban_containers={
                    JSON.parse(kanban?.containers) as KanbanContainerData[]
                }
                kanban_tasks={JSON.parse(kanban.tasks) as KanbanTask[]}
            />
        </DashboardContainer>
    )
}
