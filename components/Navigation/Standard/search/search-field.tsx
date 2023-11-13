'use client'

import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { useSearchContext } from './search-context'
import { SearchPhrase } from '@/helpers/search'

export default function SearchField() {
    const { type } = useSearchContext()

    return (
        <>
            <input
                type="text"
                placeholder={`Search for ${SearchPhrase(type!)}`}
                className="searchbar"
            />
            <button className="searchbar-button">
                <MagnifyingGlassIcon className="h-6 w-6 text-white" />
                <p className="hidden">search</p>
            </button>
        </>
    )
}
