'use client'

import { useEffect } from "react"

export default function StandardLayoutBody({children}: {children: React.ReactNode}) {
    useEffect(() => {
        if (document.body.classList.contains('background-pattern')) {
            document.body.classList.remove('background-pattern');
        }

    })

    return (
        <div>
            {children}
        </div>
    )
}