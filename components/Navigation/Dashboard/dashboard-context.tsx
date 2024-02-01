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

    artistId?: string | null
    setArtistId?: Dispatch<SetStateAction<string>>

    userId?: string | null
    setUserId?: Dispatch<SetStateAction<string>>

    stripeId?: string | null
    setStripeId?: Dispatch<SetStateAction<string>>
}

const DashboardContext = createContext<DashboardContextType>({})

export const DashboardProvider = ({
    children,
    artist_handle,
    artist_id,
    artist_stripe_id,
    user_id
}: {
    children: React.ReactNode
    artist_id: string
    artist_handle: string
    artist_stripe_id: string,
    user_id: string
}) => {
    const [handle, setHandle] = useState(artist_handle)
    const [artistId, setArtistId] = useState(artist_id)
    const [stripeId, setStripeId] = useState(artist_stripe_id)
    const [userId, setUserId] = useState(user_id)

    useEffect(() => {
        document.body.classList.add('background-pattern')
    })

    return (
        <DashboardContext.Provider
            value={{
                handle,
                setHandle,
                artistId,
                setArtistId,
                userId,
                setUserId,
                stripeId,
                setStripeId,
            }}
        >
            {children}
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext)
