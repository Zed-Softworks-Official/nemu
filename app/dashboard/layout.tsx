import 'react-toastify/ReactToastify.min.css'
import type { Metadata } from 'next'

import Navbar from '@/components/navigation/dashboard/Navbar'
import Footer from '@/components/footer'
import { DashboardProvider } from '@/components/navigation/dashboard/dashboard-context'

export const metadata: Metadata = {
    title: 'Nemu | Artist Dashboard',
    description: "An Artist's Best Friend"
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardProvider>
            <Navbar>
                {children}
                <div className="relative w-full">
                    <Footer />
                </div>
            </Navbar>
        </DashboardProvider>
    )
}
