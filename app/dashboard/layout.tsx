import type { Metadata, } from 'next'

import Navbar from '@/components/Navigation/Dashboard/Navbar';

import 'react-toastify/ReactToastify.min.css';
import { DashboardProvider } from '@/components/Navigation/Dashboard/DashboardContext';
import { getSession } from '@auth0/nextjs-auth0';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
    title: 'Nemu | Artist Dashboard',
    description: 'An Artists Best Friend',
}

export default async function DashboardLayout({ children, } : { children: React.ReactNode }) {
    const session = await getSession();

    let artist_fetch = await fetch(`${process.env.BASE_URL}/api/user/info/prisma/${session!.user!.sub!}`, { method: 'GET'});
    let artist = await artist_fetch.json();

    return (
        <DashboardProvider artist_handle={artist.info.handle} artist_id={artist.info.auth0id} artist_stripe_id={artist.info.stripeAccId}>
            <Navbar />
            { children }
        </DashboardProvider>
  )
}
