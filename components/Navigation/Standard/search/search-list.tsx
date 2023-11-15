'use client'

import { useState, Fragment } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

import classNames from '@/helpers/classnames'
import { SearchType, useSearchContext } from './search-context'

const options = [
    { id: SearchType.Artist, name: 'Artists', unavailable: false },
    { id: SearchType.Commission, name: 'Commissions', unavailable: false },
    { id: SearchType.PaidAsset, name: 'Paid Assets', unavailable: false },
    { id: SearchType.FreeAsset, name: 'Free Assets', unavailable: false }
]

export default function SearchListBox() {
    const [selected, setSelected] = useState(options[0])
    const { setType } = useSearchContext()

    function changeType(value: { id: SearchType; name: string; unavailable: boolean }) {
        setSelected(value)
        setType!(value.id)
    }

    return (
        <Listbox value={selected} onChange={changeType}>
            {({ open }) => (
                <>
                    <div className="relative">
                        <Listbox.Button className="relative w-full cursor-default rounded-md rounded-r-none bg-fullwhite py-5 pr-16 pl-3 text-left text-charcoal focus:outline-none focus:ring-2 sm:text-sm sm:leading-6 dark:bg-fullblack dark:text-white">
                            <span className="flex items-center">
                                <span className="ml-3 block truncate font-bold">
                                    {selected.name}
                                </span>
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 ml-3 flex items-center pr-2">
                                <ChevronDownIcon
                                    className="h-5 w-5 text-charcoal dark:text-white"
                                    aria-hidden="true"
                                />
                            </span>
                        </Listbox.Button>

                        <Transition
                            show={open}
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                        >
                            <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-fullwhite dark:bg-fullblack dark:text-white py-5 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                {options.map((person) => (
                                    <Listbox.Option
                                        key={person.id}
                                        className={({ active }) =>
                                            classNames(
                                                active
                                                    ? 'bg-indigo-600 text-primary'
                                                    : 'text-charcoal dark:text-white',
                                                'relative cursor-default select-none py-2 pl-3 pr-2'
                                            )
                                        }
                                        value={person}
                                    >
                                        {({ selected, active }) => (
                                            <>
                                                <div className="flex items-center">
                                                    <span
                                                        className={classNames(
                                                            selected
                                                                ? 'font-semibold'
                                                                : 'font-normal',
                                                            'ml-3 block truncate'
                                                        )}
                                                    >
                                                        {person.name}
                                                    </span>
                                                </div>

                                                {selected ? (
                                                    <span
                                                        className={classNames(
                                                            active
                                                                ? 'text-primary'
                                                                : 'text-indigo-600',
                                                            'absolute inset-y-0 right-0 flex items-center pr-20'
                                                        )}
                                                    ></span>
                                                ) : null}
                                            </>
                                        )}
                                    </Listbox.Option>
                                ))}
                            </Listbox.Options>
                        </Transition>
                    </div>
                </>
            )}
        </Listbox>
    )
}
