'use client'

import { createContext, Dispatch, SetStateAction, useContext, useState } from 'react'

type DashboardContextType = {
    artistId: string
    setArtistId: Dispatch<SetStateAction<string>>
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export default function DashboardProvider({
    artist_id,
    children
}: {
    artist_id: string
    children: React.ReactNode
}) {
    const [artistId, setArtistId] = useState(artist_id)

    return (
        <DashboardContext.Provider value={{ artistId, setArtistId }}>
            {children}
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext)!
