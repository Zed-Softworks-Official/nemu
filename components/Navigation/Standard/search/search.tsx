'use client'

import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/20/solid'
import algoliasearch from 'algoliasearch'
import { Hits, Index, InstantSearch, SearchBox } from 'react-instantsearch'
import { ArtistSearchResult, CommissionSearchResult } from './search-result-combobox-item'
import { useState } from 'react'
import { Transition } from '@headlessui/react'

const algolia = algoliasearch('ATSQ2LY0T4', 'eae26c6706f2918a50a3c8b804023718')

export default function Search() {
    const [isFocused, setIsFocused] = useState(false)

    return (
        <div className="flex flex-row w-full relative">
            <InstantSearch
                searchClient={algolia}
                future={{ preserveSharedStateOnUnmount: true }}
            >
                <SearchBox
                    className="w-full"
                    classNames={{
                        input: 'input w-full bg-base-300 h-16 join-item',
                        submit: 'btn btn-primary btn-lg !rounded-r-xl join-item',
                        form: 'join w-full'
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="Search"
                    resetIconComponent={() => <></>}
                    submitIconComponent={() => (
                        <MagnifyingGlassIcon className="w-6 h-6" />
                    )}
                />

                <Transition
                    show={isFocused}
                    as={'div'}
                    className={'absolute w-full top-20 z-30'}
                    enter="transition-all duration-150 ease-in-out"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="transition-all duration-150 ease-in-out"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="bg-base-200 p-5 rounded-xl shadow-xl">
                        <div className="divider card-title">Artists</div>
                        <Index indexName="artists">
                            <Hits
                                classNames={{ list: 'flex flex-col w-full gap-5' }}
                                hitComponent={({ hit }) => (
                                    <ArtistSearchResult
                                        item_name={hit.handle as string}
                                        avatar={hit.profilePhoto as string}
                                        url={`/@${hit.handle as string}`}
                                    />
                                )}
                            />
                        </Index>

                        <div className="divider card-title">Commissions</div>
                        <Index indexName="commissions">
                            <Hits
                                classNames={{ list: 'flex flex-col w-full gap-5' }}
                                hitComponent={({ hit }) => (
                                    <CommissionSearchResult
                                        title={hit.title as string}
                                        price={hit.price as number}
                                        artist_handle={hit.artist_handle as string}
                                        featured_image={hit.featured_image as string}
                                    />
                                )}
                            />
                        </Index>

                        <div className="divider card-title">Paid Assets</div>
                        <Index indexName="products">
                            <Hits />
                        </Index>

                        <div className="divider card-title">Free Assets</div>
                    </div>
                </Transition>
            </InstantSearch>
        </div>
    )
}
