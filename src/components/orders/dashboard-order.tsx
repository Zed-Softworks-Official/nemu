'use client'

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type Dispatch,
    type SetStateAction
} from 'react'

import { type KanbanContainerData, type KanbanTaskData } from '~/lib/types'

import { api, type RouterOutputs } from '~/trpc/react'

import Loading from '~/components/ui/loading'
import { type InferSelectModel } from 'drizzle-orm'
import { type invoices } from '~/server/db/schema'

type DashboardOrderContextType = {
    orderId: string
    setOrderId: Dispatch<SetStateAction<string>>

    containers?: KanbanContainerData[]
    setContainers: Dispatch<SetStateAction<KanbanContainerData[]>>

    tasks?: KanbanTaskData[]
    setTasks: Dispatch<SetStateAction<KanbanTaskData[]>>

    kanbanId: string

    isDownpaymentInvoice: boolean
    currentInvoice: InferSelectModel<typeof invoices> | null

    requestData: RouterOutputs['request']['getRequestById']
}

const DashboardOrderContext = createContext<DashboardOrderContextType | null>(null)

export function DashboardOrderProvider(props: {
    children: React.ReactNode
    orderId: string
}) {
    const [orderId, setOrderId] = useState(props.orderId)
    const [containers, setContainers] = useState<KanbanContainerData[]>([])
    const [tasks, setTasks] = useState<KanbanTaskData[]>([])
    const [currentInvoice, setCurrentInvoice] = useState<InferSelectModel<
        typeof invoices
    > | null>(null)
    const [isDownpaymentInvoice, setIsDownpaymentInvoice] = useState(false)
    const [kanbanId, setKanbanId] = useState('')

    const { data: requestData, isLoading } = api.request.getRequestById.useQuery({
        orderId: props.orderId,
        requester: 'artist'
    })

    useEffect(() => {
        if (requestData) {
            setContainers((requestData.kanban?.containers as KanbanContainerData[]) ?? [])
            setTasks((requestData.kanban?.tasks as KanbanTaskData[]) ?? [])
            setKanbanId(requestData.kanban?.id ?? '')

            if (!requestData.invoices) {
                return
            }

            let currentInvoiceIndex = 0
            for (let i = 0; i < requestData.invoices.length; i++) {
                if (requestData.invoices[i]?.sent === false) {
                    setIsDownpaymentInvoice(i > 0)
                    currentInvoiceIndex = i
                    break
                }
            }

            const invoice = requestData.invoices[currentInvoiceIndex]
            if (invoice) {
                setCurrentInvoice(invoice)
            }
        }
    }, [requestData])

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
                orderId,
                setOrderId,
                requestData,
                containers,
                setContainers,
                tasks,
                setTasks,
                isDownpaymentInvoice,
                currentInvoice,
                kanbanId
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
