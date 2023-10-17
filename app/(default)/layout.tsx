import React from 'react';

import Navbar from '@/components/Navigation/Standard/Navbar';
import Footer from '@/components/Footer'

import StandardLayoutBody from '@/components/StandardLayoutBody';

export default function DefaultPageLayout({ children, } : { children: React.ReactNode }) {
    return (
        <StandardLayoutBody>
            <Navbar />
            { children }
            <Footer />
        </StandardLayoutBody>
  )
}
