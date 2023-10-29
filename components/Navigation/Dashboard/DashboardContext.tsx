'use client'

import { createContext, useContext, useState, Dispatch, SetStateAction, useEffect } from 'react'

type DashboardContextType = {
    handle?: string | null
    setHandle?: Dispatch<SetStateAction<string>>

    stripe_id?: string | null
    setStripeId?: Dispatch<SetStateAction<string>>
}

const DashboardContext = createContext<DashboardContextType>({});

export const DashboardProvider = async  (
    { children, artist_handle, artist_stripe_id }: 
    { 
        children: React.ReactNode, 
        artist_handle: string, 
        artist_stripe_id: string 
    }) => {
    const [handle, setHandle] = useState(artist_handle);
    const [stripe_id, setStripeId] = useState(artist_stripe_id);

    useEffect(() => {
        document.body.classList.add('background-pattern');
    })

    return (
        <DashboardContext.Provider value={{handle, setHandle, stripe_id, setStripeId}}>
            { children }
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext);