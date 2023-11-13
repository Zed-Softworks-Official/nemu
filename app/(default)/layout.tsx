import React from 'react'

import Navbar from '@/components/navigation/standard/navbar'
import Footer from '@/components/footer'

import StandardLayoutBody from '@/components/standard-layout-body'

export default function DefaultPageLayout({ children }: { children: React.ReactNode }) {
    return (
        <StandardLayoutBody>
            <Navbar />
            {children}
            <Footer />
        </StandardLayoutBody>
    )
}
