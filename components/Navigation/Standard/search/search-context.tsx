'use client'

import { Dispatch, SetStateAction, createContext, useContext, useState } from 'react'
import { SearchType } from '@/core/structures'

type SearchContextType = {
    type?: SearchType
    setType?: Dispatch<SetStateAction<SearchType>>
}

const SearchContext = createContext<SearchContextType>({})

export default function SearchProvider({ children }: { children: React.ReactNode }) {
    const [type, setType] = useState(SearchType.Artist)

    return (
        <SearchContext.Provider value={{ type, setType }}>
            {children}
        </SearchContext.Provider>
    )
}

export const useSearchContext = () => useContext(SearchContext)
