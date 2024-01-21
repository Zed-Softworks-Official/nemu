'use client'

import React from 'react'
import NemuImage from './nemu-image'

export default function Loading() {
    return (
        <div className="flex justify-center items-center w-full h-full">
            <NemuImage
                src={'/loading.gif'}
                alt="Nemu Looking Through Boxes"
                width={200}
                height={200}
                priority
            />
        </div>
    )
}
