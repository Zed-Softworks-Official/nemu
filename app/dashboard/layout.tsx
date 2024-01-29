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

    const artist = await prisma.artist.findFirst({
        where: {
            userId: session?.user.user_id
        }
    })

    return (
        <DashboardProvider
            artist_handle={artist?.handle!}
            artist_id={artist?.id!}
            artist_stripe_id={artist?.stripeAccId ? artist?.stripeAccId : ''}
        >
            <Navbar>
                {children}
                <Footer />
            </Navbar>
        </DashboardProvider>
    )
}
