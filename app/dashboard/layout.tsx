import 'react-toastify/ReactToastify.min.css'
import type { Metadata } from 'next'

import Navbar from '@/components/navigation/dashboard/Navbar'
import Footer from '@/components/footer'

import { DashboardProvider } from '@/components/navigation/dashboard/dashboard-context'
import { api } from '@/core/trpc/server'
import { getServerAuthSession } from '@/core/auth'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Nemu | Artist Dashboard',
    description: "An Artist's Best Friend"
}

export default async function Layout({ children }: { children: React.ReactNode }) {
    const session = await getServerAuthSession()

    if (!session) {
        return redirect('/u/login')
    }

    const artist = await api.artist.get_artist()

    return (
        <DashboardProvider data={artist}>
            <Navbar>
                {children}
                <Footer />
            </Navbar>
        </DashboardProvider>
    )
}
