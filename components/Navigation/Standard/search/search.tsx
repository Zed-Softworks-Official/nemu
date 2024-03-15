import React from 'react'

import SearchListBox from './search-list'
import SearchField from './search-field'
import SearchProvider from './search-context'

export default function Search() {
    return (
        <div className="w-full">
            <div className="flex w-full join">
                <SearchProvider>
                    <SearchListBox />
                    <SearchField />
                </SearchProvider>
            </div>
        </div>
    )
}
