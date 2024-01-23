'use client'

import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { useSearchContext } from './search-context'
import { SearchPhrase } from '@/core/search'

export default function SearchField() {
    const { type } = useSearchContext()

    return (
        <>
            <input
                type="text"
                placeholder={`Search for ${SearchPhrase(type!)}`}
                className="input w-full bg-base-300 h-16 join-item"
            />
            <button className="btn btn-primary btn-lg join-item">
                <MagnifyingGlassIcon className="h-6 w-6" />
                <p className="hidden">search</p>
            </button>
        </>
    )
}
