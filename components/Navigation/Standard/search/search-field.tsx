'use client'

import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { useSearchContext } from './search-context'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SearchResult } from '@/core/structures'
import {
    Hits,
    Index,
    SearchBox,
    useInstantSearch,
    useInstantSearchContext
} from 'react-instantsearch'

export default function SearchField() {
    const { type } = useSearchContext()
    const { indexUiState } = useInstantSearch()
    const {} = useInstantSearchContext()

    const searchParams = useSearchParams()

    const [query, setQuery] = useState(searchParams ? searchParams.get('search') : '')
    const [result, setResult] = useState<SearchResult[] | undefined>(undefined)
    const [isLoading, setIsLoading] = useState(true)

    const { push } = useRouter()

    return (
        <div className="join w-full">
            
            {/* <Combobox value={query} onChange={setQuery}>
                    <Combobox.Input
                        onChange={(e) => setQuery(e.currentTarget.value)}
                        className="input w-full bg-base-300 h-16 join-item"
                        placeholder={`Search for ${SearchPhrase(type!)}`}
                    />
                    <Combobox.Button
                        className="btn btn-primary btn-lg rounded-r-xl rounded-l-none"
                        onClick={() => {
                            push(
                                `/search?category=${SearchTypeToSearchParam(
                                    type!
                                )}&search=${query}`
                            )
                        }}
                    >
                        <MagnifyingGlassIcon className="h-6 w-6" />
                        <p className="hidden">search</p>
                    </Combobox.Button>
                    <Combobox.Options className="absolute top-[5rem] w-full">
                        <Transition
                            enter="transition-all ease-in-out duration-150"
                            enterFrom="opacity-0"
                            enterTo="opacity-100"
                            leave="transition-all ease-in-out duration-150"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                        >
                            <div className="bg-base-200 p-5 rounded-xl shadow-xl flex flex-col gap-5">
                                {result ? (
                                    <>
                                        {result.map((item, i) => (
                                            <Combobox.Option key={i} value={item.handle}>
                                                <SearchResultComboboxItem
                                                    item_name={item.handle!}
                                                    avatar={item.image!}
                                                    url={item.url!}
                                                />
                                            </Combobox.Option>
                                        ))}
                                        <SearchResultComboboxItem
                                            item_name={'See all results'}
                                            url={`/search?category=${SearchTypeToSearchParam(
                                                type!
                                            )}&search=${query}`}
                                        />
                                    </>
                                ) : isLoading ? (
                                    <SearchboxSkeleton />
                                ) : (
                                    <SearchResultComboboxItem
                                        item_name={'No Results Found'}
                                    />
                                )}
                            </div>
                        </Transition>
                    </Combobox.Options>
                </Combobox> */}
        </div>
    )
}
