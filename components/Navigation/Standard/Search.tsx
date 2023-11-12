import React from 'react'

import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import SearchListBox from './searchlist'

export default function Search() {
    return (
        <div className="w-full ml-20">
            <div className="flex w-full">
                <SearchListBox />
                <input
                    type="text"
                    placeholder="Search for an artist"
                    className="searchbar"
                />
                <button className="searchbar-button">
                    <MagnifyingGlassIcon className="h-6 w-6 text-white" />
                </button>
            </div>
        </div>
    )
}
