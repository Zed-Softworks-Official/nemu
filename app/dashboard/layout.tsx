import type { Metadata, } from 'next'

import Navbar from '@/components/Navigation/Dashboard/Navbar';

import 'react-toastify/ReactToastify.min.css';
import { DashboardProvider } from '@/components/Navigation/Dashboard/DashboardContext';

export const metadata: Metadata = {
    title: 'Nemu | Artist Dashboard',
    description: 'An Artists Best Friend',
}

export default function DashboardLayout({ children, } : { children: React.ReactNode }) {
    return (
        <DashboardProvider>
            <Navbar />
            { children }
        </DashboardProvider>
  )
}
