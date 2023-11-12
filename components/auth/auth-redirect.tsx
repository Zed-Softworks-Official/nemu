'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'

export default function AuthRedirect({ children }: { children: React.ReactNode }) {
    let {data: session} = useSession()
    if (session?.user) {
        return redirect('/')
    }

    return (
        <>
            { children }
        </>
    )
}