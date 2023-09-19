'use client'

import { useUser } from '@auth0/nextjs-auth0/client';
import React, { createContext, useContext, useState } from 'react';

const UserMetadataContext = createContext({});

export const UserMetadataContextProvider = ({ children }) => {
    const { user } = useUser();

    const [username, setUsername] = useState('');
    const [handle, setHandle] = useState('');
    const [artist, setArtist] = useState(false);
    const [signedIn, setSignedIn] = useState(user ? true : false);
    const [dashboardAccess, setDashboardAccess] = useState(false);

    return (
        <UserMetadataContext.Provider value={
            {
                username, setUsername, 
                handle, setHandle, 
                artist, setArtist,
                signedIn, setSignedIn,
                dashboardAccess, setDashboardAccess
            }}>
                { children }
        </UserMetadataContext.Provider>
    )
}

export const useUserMetadataContext = () => useContext(UserMetadataContext);