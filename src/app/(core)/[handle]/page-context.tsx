'use client'

import { notFound } from 'next/navigation'
import {
    createContext,
    useContext,
    useState,
    type Dispatch,
    type SetStateAction
} from 'react'

import { api, type RouterOutputs } from '~/trpc/react'

type ArtistPageContextType = {
    currentHandle: string
    setCurrentHandle: Dispatch<SetStateAction<string>>

    artist: NonNullable<RouterOutputs['artist']['getArtistData']>
    isLoading: boolean
}

const ArtistPageContext = createContext<ArtistPageContextType | null>(null)

export function ArtistPageProvider(props: { handle: string; children: React.ReactNode }) {
    const [currentHandle, setCurrentHandle] = useState(props.handle)

    const { data: artist, isLoading } = api.artist.getArtistData.useQuery({
        handle: props.handle
    })

    if (!artist && !isLoading) {
        return notFound()
    }

    return (
        <ArtistPageContext.Provider
            value={{
                currentHandle,
                setCurrentHandle,
                artist,
                isLoading
            }}
        >
            {props.children}
        </ArtistPageContext.Provider>
    )
}

export function useArtist() {
    const context = useContext(ArtistPageContext)
    if (!context) {
        throw new Error('Artist context must be defined')
    }

    return context
}
