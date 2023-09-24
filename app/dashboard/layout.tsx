import type { Metadata, } from 'next'

import Navbar from '@/components/Navigation/Dashboard/Navbar';

import 'react-toastify/ReactToastify.min.css';

export const metadata: Metadata = {
    title: 'Nemu | Artist Dashboard',
    description: 'An Artists Best Friend',
}

export default function DashboardLayout({ children, } : { children: React.ReactNode }) {
    return (
        <div>
            <Navbar />
            { children }
        </div>
  )
}
