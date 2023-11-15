import 'react-toastify/ReactToastify.min.css'
import type { Metadata } from 'next'

import Navbar from '@/components/navigation/dashboard/navbar'

import { DashboardProvider } from '@/components/navigation/dashboard/dashboard-context'
import Footer from '@/components/footer'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
    title: 'Nemu | Artist Dashboard',
    description: "An Artist's Best Friend"
}

export default async function DashboardLayout({
    children
}: {
    children: React.ReactNode
}) {
    const session = await getServerSession()

    const user = await prisma.user.findFirst({
        where: {
            name: session?.user.name
        }
    })

    const artist_fetch = await fetch(`${process.env.BASE_URL}/api/artist/${user?.id}`, {
        method: 'GET'
    })
    const artist = await artist_fetch.json()

    return (
        <DashboardProvider
            artist_handle={artist.info.handle}
            artist_user_id={artist.info.userId}
            artist_stripe_id={artist.info.stripeAccId}
        >
            <Navbar />
            {children}
            <Footer />
        </DashboardProvider>
    )
}
