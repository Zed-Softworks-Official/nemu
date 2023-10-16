'use client'

import { createContext, useContext, useState, Dispatch, SetStateAction, useEffect } from 'react'

type DashboardContextType = {
    handle?: string | null
    setHandle?: Dispatch<SetStateAction<string>>

    id?: string | null
    setId?: Dispatch<SetStateAction<string>> | null

    stripe_id?: string | null
    setStripeId?: Dispatch<SetStateAction<string>>
}

const DashboardContext = createContext<DashboardContextType>({});

export const DashboardProvider = (
    { children, artist_handle, artist_id, artist_stripe_id }: 
    { 
        children: React.ReactNode, 
        artist_handle: string, 
        artist_id: string, 
        artist_stripe_id: string 
    }) => {
    const [handle, setHandle] = useState(artist_handle);
    const [id, setId] = useState(artist_id);
    const [stripe_id, setStripeId] = useState(artist_stripe_id);

    useEffect(() => {
        document.body.classList.add('background-pattern');
    })

    return (
        <DashboardContext.Provider value={{handle, setHandle, id, setId, stripe_id, setStripeId}}>
            { children }
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext);