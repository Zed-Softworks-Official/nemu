'use client'

import { SessionProvider } from 'next-auth/react'
import ArtistProvider from '../ArtistProvider'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <ArtistProvider>
                { children }
            </ArtistProvider>
        </SessionProvider>
    )
}