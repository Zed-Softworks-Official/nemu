import React from 'react';

import Navbar from '@/components/Navigation/Standard/Navbar';

export default function DefaultPageLayout({ children, } : { children: React.ReactNode }) {
    return (
        <div>
            <Navbar />
            { children }
        </div>
  )
}
