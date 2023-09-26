'use client'

import { useUser } from '@auth0/nextjs-auth0/client';
import { createContext, useContext, useState, Dispatch, SetStateAction, useEffect } from 'react';

import useSWR from 'swr';
import { fetcher } from '@/helpers/fetcher';

type DashboardContextType = {
    handle?: string | null
    setHandle?: Dispatch<SetStateAction<string>>

    id?: string | null
    setId?: Dispatch<SetStateAction<string>> | null
}

const DashboardContext = createContext<DashboardContextType>({});

export const DashboardProvider = ({ children, artist_handle, artist_id }: { children: React.ReactNode, artist_handle: string, artist_id: string }) => {
    const [handle, setHandle] = useState(artist_handle);
    const [id, setId] = useState(artist_id);

    useEffect(() => {
        document.body.classList.add('background-pattern');
    })

    return (
        <DashboardContext.Provider value={{handle, setHandle, id, setId}}>
            { children }
        </DashboardContext.Provider>
    )
}

export const useDashboardContext = () => useContext(DashboardContext);