'use client'

import { createContext, useContext, useState, Dispatch, SetStateAction } from 'react'
import { User, Artist } from '@/helpers/user-info'

// export interface Artist {
//     auth0_id: string
//     setAuth0Id: Dispatch<SetStateAction<string>>,
//     stripe_id: string
//     setStripeId: Dispatch<SetStateAction<string>>,

//     handle: string
//     setHandle: Dispatch<SetStateAction<string>>,
//     store_enabled: boolean
//     setStoreEnabled: Dispatch<SetStateAction<boolean>>
//     location: string
//     setLocation: Dispatch<SetStateAction<string>>
//     username: string
//     setArtistUsername: Dispatch<SetStateAction<string>>

//     about: string
//     about_editor: string

//     terms: string
//     terms_editor: string

//     twitter: string
//     pixiv: string
//     website: string
// }

const GlobalContext = createContext<User>({
    signed_in: false,
    dashboard_access: false
});

export const GlobalContextProvider = ({ children }) => {
    return ({children})
}