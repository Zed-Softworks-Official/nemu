'use client'

import { Dispatch, SetStateAction, createContext, useContext, useState } from 'react'

type ShopContextType = {
    productId?: string
    setProductId?: Dispatch<SetStateAction<string>>

    stripeAccount?: string
    setStripeAccount?: Dispatch<SetStateAction<string>>

    handle?: string
    setHandle?: Dispatch<SetStateAction<string>>
}

const ShopContext = createContext<ShopContextType>({})

export const ShopProvider = ({ children }: { children: React.ReactNode }) => {
    const [productId, setProductId] = useState('')
    const [stripeAccount, setStripeAccount] = useState('')
    const [handle, setHandle] = useState('')

    return (
        <ShopContext.Provider
            value={{
                productId,
                setProductId,
                stripeAccount,
                setStripeAccount,
                handle,
                setHandle
            }}
        >
            {children}
        </ShopContext.Provider>
    )
}

export const useShopContext = () => useContext(ShopContext)
