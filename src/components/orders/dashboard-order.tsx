'use client'

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type Dispatch,
    type SetStateAction
} from 'react'

import { type KanbanContainerData, type KanbanTaskData } from '~/lib/structures'

import { api, type RouterOutputs } from '~/trpc/react'

import Loading from '~/components/ui/loading'
import { type InferSelectModel } from 'drizzle-orm'
import { type invoices } from '~/server/db/schema'

type DashboardOrderContextType = {
    order_id: string
    set_order_id: Dispatch<SetStateAction<string>>

    containers?: KanbanContainerData[]
    set_containers: Dispatch<SetStateAction<KanbanContainerData[]>>

    tasks?: KanbanTaskData[]
    set_tasks: Dispatch<SetStateAction<KanbanTaskData[]>>

    kanban_id: string

    is_downpayment_invoice: boolean
    current_invoice: InferSelectModel<typeof invoices> | null

    request_data: RouterOutputs['request']['getRequestById']
}

const DashboardOrderContext = createContext<DashboardOrderContextType | null>(null)

export function DashboardOrderProvider(props: {
    children: React.ReactNode
    order_id: string
}) {
    const [orderId, setOrderId] = useState(props.order_id)
    const [containers, setContainers] = useState<KanbanContainerData[]>([])
    const [tasks, setTasks] = useState<KanbanTaskData[]>([])
    const [currentInvoice, setCurrentInvoice] = useState<InferSelectModel<
        typeof invoices
    > | null>(null)
    const [isDownpaymentInvoice, setIsDownpaymentInvoice] = useState(false)
    const [kanbanId, setKanbanId] = useState('')

    const { data: request_data, isLoading } = api.request.getRequestById.useQuery({
        order_id: props.order_id,
        requester: 'artist'
    })

    useEffect(() => {
        if (request_data) {
            setContainers(
                (request_data.kanban?.containers as KanbanContainerData[]) ?? []
            )
            setTasks((request_data.kanban?.tasks as KanbanTaskData[]) ?? [])
            setKanbanId(request_data.kanban?.id ?? '')

            if (!request_data.invoices) {
                return
            }

            let current_invoice_index = 0
            for (let i = 0; i < request_data.invoices.length; i++) {
                if (request_data.invoices[i]?.sent === false) {
                    setIsDownpaymentInvoice(i > 0 ? true : false)
                    current_invoice_index = i
                    break
                }
            }

            setCurrentInvoice(request_data.invoices[current_invoice_index]!)
        }
    }, [request_data])

    if (isLoading) {
        return (
            <div className="flex h-full w-full flex-1 items-center justify-center">
                <Loading />
            </div>
        )
    }

    return (
        <DashboardOrderContext.Provider
            value={{
                order_id: orderId,
                set_order_id: setOrderId,
                request_data,
                containers,
                set_containers: setContainers,
                tasks,
                is_downpayment_invoice: isDownpaymentInvoice,
                current_invoice: currentInvoice,
                set_tasks: setTasks,
                kanban_id: kanbanId
            }}
        >
            {props.children}
        </DashboardOrderContext.Provider>
    )
}

export function useDashboardOrder() {
    const context = useContext(DashboardOrderContext)

    if (!context) {
        throw new Error('useOrder must be used within a OrderProvider')
    }

    return context
}
