'use client'

import { createContext, useContext, useState, Dispatch, SetStateAction } from 'react'

type TabsContextType = {
    currentIndex?: number
    setCurrentIndex?: Dispatch<SetStateAction<number>>
}

const TabsContext = createContext<TabsContextType>({})

export const TabsProvider = ({ children }: { children: React.ReactNode }) => {
    const [currentIndex, setCurrentIndex] = useState(0)

    return (
        <TabsContext.Provider value={{ currentIndex, setCurrentIndex }}>
            {children}
        </TabsContext.Provider>
    )
}

export const useTabsContext = () => useContext(TabsContext)
