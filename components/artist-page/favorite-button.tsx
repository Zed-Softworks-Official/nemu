'use client'

import { useState } from 'react'
import { ClassNames } from '@/core/helpers'

export default function FavoriteButton() {
    const [active, setActive] = useState(false)

    // w-[18.5rem] h-[16rem] scale-[0.18]
    return (
        <div className="absolute top-0 right-14 bg-base-200 p-2 pt-8 rounded-b-full">
            <div
                className={ClassNames("bg-[url('/favorite-button.png')] bg-left bg-cover w-10 h-9  cursor-pointer", active && 'animate-favorite-button bg-right')}
                onClick={() => {
                    setActive(!active)
                }}
            ></div>
        </div>
    )
}
