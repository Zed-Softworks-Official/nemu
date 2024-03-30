'use client'

import Loading from '@/components/loading'
import { ArtistPageResponse } from '@/core/responses'
import { api } from '@/core/trpc/react'
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

export function DashboardProvider({ children }: { children: React.ReactNode }) {
    const { data, isLoading } = api.artist.get_artist.useQuery()

    const [artist, setArtist] = useState(data)

    useEffect(() => {
        document.body.classList.add('background-pattern')

        setArtist(data)
    }, [data])

    if (isLoading && !data) {
        return (
            <div className="w-screen h-screen">
                <Loading />
            </div>
        )
    }

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
