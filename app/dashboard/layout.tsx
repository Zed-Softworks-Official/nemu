import 'react-toastify/ReactToastify.min.css'
import type { Metadata } from 'next'

import DsahboardSetContext from '@/components/dashboard/dashboard-set-context'

import Navbar from '@/components/navigation/dashboard/Navbar'
import Footer from '@/components/footer'

export const metadata: Metadata = {
    title: 'Nemu | Artist Dashboard',
    description: "An Artist's Best Friend"
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <DsahboardSetContext>
            <Navbar>
                {children}
                <Footer />
            </Navbar>
        </DsahboardSetContext>
    )
}
