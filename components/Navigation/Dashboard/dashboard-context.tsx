'use client'

import {
    createContext,
    useContext,
    useState,
    Dispatch,
    SetStateAction,
    useEffect
} from 'react'

type DashboardContextType = {
    handle?: string | null
    setHandle?: Dispatch<SetStateAction<string>>

    userId?: string | null
    setUserId?: Dispatch<SetStateAction<string>>

    stripe_id?: string | null
    setStripeId?: Dispatch<SetStateAction<string>>
}

const DashboardContext = createContext<DashboardContextType>({})

export const DashboardProvider = ({
    children,
    artist_handle,
    artist_user_id,
    artist_stripe_id
}: {
    children: React.ReactNode
    artist_user_id: string
    artist_handle: string
    artist_stripe_id: string
}) => {
    const [handle, setHandle] = useState(artist_handle)
    const [userId, setUserId] = useState(artist_user_id)
    const [stripe_id, setStripeId] = useState(artist_stripe_id)

    useEffect(() => {
        document.body.classList.add('background-pattern')
    })

    return (
        <DashboardContext.Provider
            value={{
                handle,
                setHandle,
                userId,
                setUserId,
                stripe_id,
                setStripeId
            }}
        >
            {children}
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext)
