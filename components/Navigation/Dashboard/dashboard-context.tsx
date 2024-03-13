'use client'

import { GraphQLFetcher } from '@/core/helpers'
import { useSession } from 'next-auth/react'
import { createContext, useContext, useState, Dispatch, SetStateAction, useEffect } from 'react'
import useSWR from 'swr'

type DashboardContextType = {
    handle?: string | null
    setHandle?: Dispatch<SetStateAction<string>>

    artistId?: string | null
    setArtistId?: Dispatch<SetStateAction<string>>

    userId?: string | null
    setUserId?: Dispatch<SetStateAction<string | undefined>>

    stripeId?: string | null
    setStripeId?: Dispatch<SetStateAction<string>>
}

const DashboardContext = createContext<DashboardContextType>({})

export function DashboardProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession()

    const [handle, setHandle] = useState('')
    const [artistId, setArtistId] = useState('')
    const [stripeId, setStripeId] = useState('')

    const [userId, setUserId] = useState<string | undefined>(undefined)

    useEffect(() => {
        // Set Background
        document.body.classList.add('background-pattern')

        // Check if we have a valid session
        if (!session) {
            return
        }

        // Get Artist Data
        GraphQLFetcher<{
            user: {
                artist: {
                    id: string
                    handle: string
                    stripeAccount: string
                }
            }
        }>(
            `{
                user(id: "${session.user.user_id}") {
                    artist {
                        id
                        handle
                        stripeAccount
                    }
                }
            }`
        ).then((response) => {
            setHandle(response.user.artist.handle)
            setArtistId(response.user.artist.id)
            setStripeId(response.user.artist.stripeAccount)
            setUserId(session.user.user_id!)
        })
    }, [session])

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
                setStripeId
            }}
        >
            {children}
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext)
