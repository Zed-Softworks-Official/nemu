'use client'

import React, { useState } from 'react'
import { ClipLoader } from 'react-spinners'

export default function Loading() {
    let [loading, setLoading] = useState(true)
    let [color, setColor] = useState('#2185d5')

    return (
        <div className="flex justify-center my-[20rem]">
            <ClipLoader
                color={color}
                loading={loading}
                size={150}
                aria-label="Loading..."
            />
        </div>
    )
}
