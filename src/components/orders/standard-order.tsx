'use client'

import { createContext, useContext, useState } from 'react'

import { api, type RouterOutputs } from '~/trpc/react'
import Loading from '~/components/ui/loading'

type StandardOrderContextType = {
    order_id: string

    request_data: RouterOutputs['request']['get_request_by_id']
}

const StandardOrderContext = createContext<StandardOrderContextType | null>(null)

export function StandardOrderProvider(props: {
    children: React.ReactNode
    order_id: string
}) {
    const [orderId] = useState(props.order_id)

    const { data: request_data, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: props.order_id,
        requester: 'user'
    })

    if (isLoading) {
        return <Loading />
    }

    return (
        <StandardOrderContext.Provider
            value={{
                order_id: orderId,
                request_data
            }}
        >
            {props.children}
        </StandardOrderContext.Provider>
    )
}

export function useOrder() {
    const context = useContext(StandardOrderContext)

    if (!context) {
        throw new Error('useOrder must be used within a StandardOrderProvider')
    }

    return context
}
