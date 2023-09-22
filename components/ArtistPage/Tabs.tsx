"use client"

import { useState } from 'react'
import { Tab } from '@headlessui/react'

import classNames from '@/helpers/classnames'

export default function ArtistProfileTabs() {
  let [categories] = useState([
    'Commissions',
    'Store',
    'Portfolio'
  ]);

  return (
    <div className="w-[100rem] max-w-md px-2 sm:px-0 ">
      <Tab.Group>
        <Tab.List className="flex space-x-1 rounded-xl p-1">
          {categories.map( (category) => (
            <Tab
              key={category}
              className={({ selected }) =>
                classNames(
                  'w-full rounded-lg py-2.5 ring-0 focus:ring-0 text-lg font-semibold leading-5 p-16',
                  selected
                    ? 'bg-fullwhite focus:ring-0'
                    : 'ring-0'
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
