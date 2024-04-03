'use client'

import Loading from '@/components/loading'
import { ArtistPageResponse } from '@/core/responses'
import { api } from '@/core/trpc/react'
import { Artist } from '@prisma/client'
import {
    createContext,
    useContext,
    useState,
    Dispatch,
    SetStateAction,
    useEffect
} from 'react'

type DashboardContextType = {
    artist: ArtistPageResponse
    setArtist: Dispatch<SetStateAction<ArtistPageResponse>>
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined)

export function DashboardProvider({
    data,
    children
}: {
    data: ArtistPageResponse
    children: React.ReactNode
}) {
    const [artist, setArtist] = useState(data)

    useEffect(() => {
        document.body.classList.add('background-pattern')

        setArtist(data)
    }, [data])

    return (
        <DashboardContext.Provider
            value={{
                artist,
                setArtist
            }}
        >
            {children}
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext)
