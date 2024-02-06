"use client"

import { useState } from 'react'
import { Tab } from '@headlessui/react'

import { ClassNames } from '@/core/helpers'
import { useTabsContext } from './tabs-context';

export default function ArtistProfileTabs() {
  let [categories] = useState([
    'Commissions',
    'Store',
    'Portfolio'
  ]);

  const { currentIndex, setCurrentIndex } = useTabsContext();

  return (
    <div className="w-[100rem] max-w-md px-2 sm:px-0 ">
      <Tab.Group selectedIndex={currentIndex} onChange={setCurrentIndex}>
        <Tab.List className="flex space-x-1 rounded-xl p-1">
          {categories.map( (category) => (
            <Tab
              key={category}
              className={({ selected }) =>
                ClassNames(
                  'w-full rounded-lg py-2.5 ring-opacity-0 text-lg font-semibold leading-5 p-16',
                  selected
                    ? 'bg-base-300 focus:ring-0'
                    : 'ring-opacity-0'
                )
              }
            >
              {category}
            </Tab>
          ))}
        </Tab.List>
      </Tab.Group>
    </div>
  )
}
