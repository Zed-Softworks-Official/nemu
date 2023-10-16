'use client'

import useSWR from 'swr'

import { createContext, useContext, useState, Dispatch, SetStateAction } from 'react'
import { getSession, useSession } from 'next-auth/react'

import { Social } from '@/helpers/user-info'

type ArtistContextType = {
    handle?: string
    about?: string
    location?: string
    store?: boolean
    terms?: string

    socials?: Social[] | null
    
    headerPhoto?: string
    profilePhoto?: string
    
    stripe_id?: string
    user_id?: string

    setHandle?: Dispatch<SetStateAction<string>>
    setAbout?: Dispatch<SetStateAction<string>>
    setLocation?: Dispatch<SetStateAction<string>>
    setStore?: Dispatch<SetStateAction<boolean>>
    setTerms?: Dispatch<SetStateAction<string>>

    setSocials?: Dispatch<SetStateAction<Social[]>>

    setHeaderPhoto?: Dispatch<SetStateAction<string>>
    setProfilePhoto?: Dispatch<SetStateAction<string>>

    setStripeId?: Dispatch<SetStateAction<string>>
    setUserId?: Dispatch<SetStateAction<string>>
}

const ArtistContext = createContext<ArtistContextType>({})

export default function ArtistProvider({ children }: { children: React.ReactNode }) {
    // Initialize default state
    const [handle, setHandle] = useState('')
    const [about, setAbout] = useState('')
    const [location, setLocation] = useState('')
    const [store, setStore] = useState(false)
    const [terms, setTerms] = useState('')

    const [socials, setSocials] = useState([{}])

    const [headerPhoto, setHeaderPhoto] = useState('')
    const [profilePhoto, setProfilePhoto] = useState('')

    const [stripe_id, setStripeId] = useState('')
    const [user_id, setUserId] = useState('')

    // Get the user from the session
    const { data: session } = useSession()

    // Check if they're an artist

        // Fill out the states

    return (
        <ArtistContext.Provider value={{
            handle, setHandle,
            about, setAbout,
            location, setLocation,
            store, setStore,
            terms, setTerms,

            socials, setSocials,

            headerPhoto, setHeaderPhoto,
            profilePhoto, setProfilePhoto,

            stripe_id, setStripeId,
            user_id, setUserId
        }}>
            { children }
        </ArtistContext.Provider>
    )
}

export const useArtistContext = () => useContext(ArtistContext)