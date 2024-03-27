'use client'

import { Dispatch, SetStateAction, createContext, useContext, useState } from 'react'
import { SearchType } from '@/core/structures'
import { InstantSearch } from 'react-instantsearch'

import algoliasearch from 'algoliasearch'

type SearchContextType = {
    type?: SearchType
    setType?: Dispatch<SetStateAction<SearchType>>
}

const SearchContext = createContext<SearchContextType>({})

const algolia = algoliasearch('ATSQ2LY0T4', 'eae26c6706f2918a50a3c8b804023718')

export default function SearchProvider({ children }: { children: React.ReactNode }) {
    const [type, setType] = useState(SearchType.Artist)

    return (
        <SearchContext.Provider value={{ type, setType }}>
            {children}
        </SearchContext.Provider>
    )
}

export const useSearchContext = () => useContext(SearchContext)
