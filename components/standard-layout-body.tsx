'use client'

import { useEffect } from 'react'

export default function StandardLayoutBody({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (document.body.classList.contains('background-pattern')) {
            document.body.classList.remove('background-pattern')
        }
    })

    return <div className="flex-[1] container mx-auto min-h-screen">{children}</div>
}
