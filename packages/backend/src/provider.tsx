'use client'

import { createContext, useContext, useState } from 'react'

type BackendProviderContextType = {
    mode: 'lan' | 'relay'
    setMode: (mode: 'lan' | 'relay') => void
}

const BackendProviderContext = createContext<BackendProviderContextType | null>(
    null
)

export function BackendProvider(props: { children: React.ReactNode }) {
    const [mode, setMode] = useState<'lan' | 'relay'>('lan')

    return (
        <BackendProviderContext.Provider value={{ mode, setMode }}>
            {props.children}
        </BackendProviderContext.Provider>
    )
}

export function useBackend() {
    const context = useContext(BackendProviderContext)
    if (!context) {
        throw new Error('useBackend must be used within a BackendProvider')
    }

    return context
}
