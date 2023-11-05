'use client' 

import { Role } from '@/helpers/user-info';
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'

export default function AuthCheck({ children, admin_only = false }: { children: React.ReactNode, admin_only?: boolean }) {
    const {data: session, status } = useSession();

    if (status === 'unauthenticated') {
        redirect('/api/auth/signin')
    }

    if (admin_only) {
        if (session?.user.role as Role != Role.Admin) {
            redirect('/')
        }
    }

    return (
        <>
            { children }
        </>
    )
}