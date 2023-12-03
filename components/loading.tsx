'use client'

import Image from 'next/image'
import React from 'react'

export default function Loading() {
    return (
        <div className="flex justify-center items-center w-full">
            <Image
                src={'/loading.gif'}
                alt="Nemu Looking Through Boxes"
                width={200}
                height={200}
            />
        </div>
    )
}
