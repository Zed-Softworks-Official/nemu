import { clerkClient } from '@clerk/nextjs/server'
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
    
    const user = await clerkClient.users.getUser(request.user_id)
    const kanban = await api.kanban.get_kanban(request.id)

    if (!kanban) {
        return null
    }

    return (
        <DashboardContainer title={`Request for ${user.username || user.firstName || 'User'}`}>
            <Kanban
                client={user.username || user.firstName || 'User'}
                title={request.commission.title}
                kanban_containers={kanban.containers as KanbanContainerData[]}
                kanban_tasks={kanban.tasks as KanbanTask[] || []}
                kanban_id={kanban.id}
            />
        </DashboardContainer>
    )
}
