import React from 'react';

import Navbar from '@/components/Navigation/Standard/Navbar';
import StandardLayoutBody from '@/components/StandardLayoutBody';

export default function DefaultPageLayout({ children, } : { children: React.ReactNode }) {
    return (
        <StandardLayoutBody>
            <Navbar />
            { children }
        </StandardLayoutBody>
  )
}
