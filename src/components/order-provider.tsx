'use client'

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type Dispatch,
    type SetStateAction
} from 'react'

import type { KanbanContainerData, KanbanTaskData } from '~/lib/structures'
import { api, type RouterOutputs } from '~/trpc/react'

import Loading from '~/components/ui/loading'

type OrderContextType = {
    order_id: string
    set_order_id: Dispatch<SetStateAction<string>>

    containers?: KanbanContainerData[]
    set_containers: Dispatch<SetStateAction<KanbanContainerData[]>>

    tasks?: KanbanTaskData[]
    set_tasks: Dispatch<SetStateAction<KanbanTaskData[]>>

    kanban_id: string

    request_data: RouterOutputs['request']['get_request_by_id']
}

const OrderContext = createContext<OrderContextType | null>(null)

export function OrderProvider(props: { children: React.ReactNode; order_id: string }) {
    const [orderId, setOrderId] = useState(props.order_id)
    const [containers, setContainers] = useState<KanbanContainerData[]>([])
    const [tasks, setTasks] = useState<KanbanTaskData[]>([])

    const [kanbanId, setKanbanId] = useState('')

    const { data: request_data, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: props.order_id
    })

    useEffect(() => {
        if (request_data) {
            setContainers(
                (request_data.kanban?.containers as KanbanContainerData[]) ?? []
            )
            setTasks((request_data.kanban?.tasks as KanbanTaskData[]) ?? [])
            setKanbanId(request_data.kanban?.id ?? '')
        }
    }, [request_data])

    if (isLoading) {
        return <Loading />
    }

    return (
        <OrderContext.Provider
            value={{
                order_id: orderId,
                set_order_id: setOrderId,
                request_data,
                containers,
                set_containers: setContainers,
                tasks,
                set_tasks: setTasks,
                kanban_id: kanbanId
            }}
        >
            {props.children}
        </OrderContext.Provider>
    )
}

export function useOrder() {
    const context = useContext(OrderContext)

    if (!context) {
        throw new Error('useOrder must be used within a OrderProvider')
    }

    return context
}
